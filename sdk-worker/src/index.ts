import { MetaMaskSDK, MetaMaskSDKOptions } from '@metamask/sdk';
import sendBid, { sendBidToStream } from './utils/store';
const qrcode = require('qrcode-terminal');

const options: MetaMaskSDKOptions = {
  shouldShimWeb3: false,
  dappMetadata: {
    name: 'Sotheb3s Auction House Demo',
    url: 'https://localhost:3000',
  },
  logging: {
    sdk: false,
  },
  checkInstallationImmediately: false,
  modals: {
    install: ({ link }) => {
      qrcode.generate(link, { small: true }, (qr) => console.log(qr));
      return {};
    },
    otp: () => {
      return {
        mount() {},
        updateOTPValue: (otpValue) => {
          if (otpValue !== '') {
            console.debug(
              `[CUSTOMIZE TEXT] Choose the following value on your metamask mobile wallet: ${otpValue}`,
            );
          }
        },
      };
    },
  },
};

let bidHistory: Array<any> = [];
let sdk = new MetaMaskSDK(options);
let connectedWallets: { [address: string]: number } = {};

const MAX_WALLET_CONNECTIONS = 20;
const BID_INCREMENT = 5;


//This create bid function will eventually call the zkSync contract we deploy to create a bid
const createBid = (fromAddress: string, itemId: number, bidAmount: number) => {
  const msgParams = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Bid: [
        { name: 'from', type: 'Person' },
        { name: 'itemId', type: 'uint256' },
        { name: 'bidAmount', type: 'uint256' },
      ],
      Person: [
        { name: 'name', type: 'string' },
        { name: 'wallet', type: 'address' },
      ],
    },
    primaryType: 'Bid',
    domain: {
      name: 'Ether Mail',
      version: '1',
      chainId: '0xe704',
      verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
    },
    message: {
      from: {
        name: 'Bidder',
        wallet: fromAddress,
      },
      itemId,
      bidAmount,
      
    },
  };

  return msgParams;
};

const startNewConnectionProcess = async () => {
  console.log("Starting a new connection process...");

  // Create a new SDK instance with the options (which includes the QR code generation logic)
  sdk = new MetaMaskSDK(options);
  
  // Call the start function again to initiate a new connection
  await start();
};

const start = async () => {
  try {
    console.debug(`Auction House Instance: ${sdk}`);

    const accounts = await sdk.connect();
    console.log('connect request accounts', accounts);

    const ethereum = sdk.getProvider();

    ethereum.on('_initialized', async () => {
      const from = accounts?.[0];

      if (from) {
        // Register or update the wallet connection count
        connectedWallets[from] = (connectedWallets[from] || 0) + 1;

        // Check if the maximum number of different wallet connections is reached
        if (Object.keys(connectedWallets).length <= MAX_WALLET_CONNECTIONS) {
          // ... (existing _initialized event handling code)

          const itemId = 1; // Get this dynamically, perhaps from user input or another source
          let bidAmount = 1000; // Get this dynamically, perhaps from user input

          // Allow users to bid again with an increased bid amount
          bidAmount += connectedWallets[from] * BID_INCREMENT;

          const msgParams = createBid(from, itemId, bidAmount);
          const signResponse = await ethereum.request({
            method: 'eth_signTypedData_v4',
            params: [from, JSON.stringify(msgParams)],
          });
          const dateTimestamp = new Date().getTime();

          const bidData = {
            from,
            itemId,
            bidAmount,
            signature: signResponse,
            dateTimestamp,
          };

          console.log('sign response', signResponse);
          //sendBid(bidData);
          bidHistory.push({ from, itemId, bidAmount, signature: signResponse });
          console.log('Bid history', bidHistory);

          // Start a new connection process
          //await startNewConnectionProcess();
        } else {
          console.log('Maximum number of different wallet connections reached.');
        }
      }
    });
  } catch (err) {
    console.error(err);
  }
};

start().catch((err) => {
  console.error(err);
});
