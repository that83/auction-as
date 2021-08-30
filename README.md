# auction-as
 A sample smart contract for auction in NEAR protocol

1. Download source code, install Node
2. Install near-sdk-as:
npm install --save near-sdk-as
3. Compile contract:
npx asb
4. Deploy contract:
near deploy  --contractName=<sellerAccount>.testnet  --wasmFile=./contract.wasm
5. Using:
near call <sellerAccount>.testnet reset '{\"description\":\"Bag\",\"reservePrice\":\"1\",\"expectedSellPrice\":\"10\",\"bidIncrement\":\"1\",\"minutes\":\"10\"}' --account_id that83.testnet --gas=200000000000000
near call <sellerAccount>.testnet explain --account_id <accountOfBidder1>.testnet --gas=200000000000000
near call <sellerAccount>.testnet bid --account_id <accountOfBidder1>.testnet  --amount 1 --gas=200000000000000
near call <sellerAccount>.testnet bid --account_id <accountOfBidder2>.testnet  --amount 2 --gas=200000000000000
near call <sellerAccount>.testnet bid --account_id <accountOfBidder1>.testnet  --amount 9 --gas=200000000000000
near call <sellerAccount>.testnet finalize --account_id <accountOfBidder2>.testnet --gas=200000000000000
