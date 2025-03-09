const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
const { v1: uuidv1 } = require('uuid');
const axios = require('axios'); // import axios
const cors = require('cors');
const port = process.argv[2];
const nodeAddress = uuidv1().split('-').join(''); 
const bitcoin = new Blockchain();

bitcoin.currentNodeUrl = `http://localhost:${port}`;

app.use(cors());  // enable CORS for all routes
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// route to get the entire blockchain
app.get('/blockchain', function (req, res) {
  res.send(bitcoin);
});

// route to create a new transaction
app.post('/transaction', function (req, res) {
  const { sender, recipient, amount } = req.body;
  if (!sender || !recipient || !amount) {
    return res.status(400).json({ note: 'Missing parameters.' });
  }
  const newTransaction = { sender, recipient, amount };
  bitcoin.addTransactionToPendingTransactions(newTransaction);
  console.log("Pending Transactions:", bitcoin.pendingTransactions);

  const lastBlock = bitcoin.getLastBlock();
  const previousBlockHash = lastBlock.hash;
  const currentBlockData = {
    transactions: bitcoin.pendingTransactions,
    index: lastBlock.index + 1
  };

  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
  const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

  console.log("New Block Created:", newBlock);

  res.json({ note: `Transaction added and block mined successfully`, block: newBlock });
});

// route to broadcast a transaction to all nodes
app.post('/transaction/broadcast', async (req, res) => {
  const newTransaction = bitcoin.createNewTransaction(req.body.amount, req.body.sender, req.body.recipient);
  bitcoin.addTransactionToPendingTransactions(newTransaction);

  try {
    await Promise.all(bitcoin.networkNodes.map(networkNodeUrl =>
      axios.post(`${networkNodeUrl}/transaction`, newTransaction)
    ));
    res.json({ note: 'Transaction created and broadcast successfully.' });
  } catch (error) {
    console.error('Error broadcasting transaction:', error.message);
    res.status(500).json({ note: 'Error broadcasting transaction to all nodes.' });
  }
});

// route to mine a new block
app.get('/mine', async (req, res) => {
  // console.log('Network Nodes:', bitcoin.networkNodes);
  
  // check if blockchain has any blocks
  const lastBlock = bitcoin.getLastBlock();
  const previousBlockHash = lastBlock['hash'];
  // if blockchain is empty, initialize the genesis block
  const currentBlockData = {
    transactions: bitcoin.pendingTransactions,
    index: lastBlock['index'] + 1
  };

  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
  const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
  const newBlock = bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

  try {
    // broadcast to other nodes
    await Promise.all(bitcoin.networkNodes.map(networkNodeUrl => {
      return axios.post(`${networkNodeUrl}/receive-new-block`, { newBlock });
    }));

    // create a mining reward transaction
    await axios.post(`${bitcoin.currentNodeUrl}/transaction/broadcast`, {
      amount: 12.5,
      sender: '00',
      recipient: nodeAddress
    });

    res.json({ note: 'New block mined & broadcast successfully', block: newBlock });
  } catch (error) {
    console.error('Error broadcasting mined block:', error.message);
    res.status(500).json({ note: 'Error broadcasting mined block.' });
  }
});

// route to receive a new block
app.post('/receive-new-block', function (req, res) {
  const newBlock = req.body.newBlock;
  
  // Log the incoming new block for debugging
  console.log('Received new block:', newBlock);
  
  if (!newBlock) {
    return res.status(400).json({
      error: 'No block data provided in the request.'
    });
  }

  const lastBlock = bitcoin.getLastBlock();
  
  // Ensure lastBlock and previousBlockHash are valid
  if (!lastBlock || !lastBlock.hash) {
    return res.status(400).json({
      error: 'Invalid blockchain. Cannot compare blocks.'
    });
  }

  const correctHash = lastBlock.hash === newBlock.previousBlockHash;
  const correctIndex = lastBlock['index'] + 1 === newBlock['index'];

  if (correctHash && correctIndex) {
    bitcoin.chain.push(newBlock);
    bitcoin.pendingTransactions = [];
    res.json({
      note: 'New block received and accepted.',
      newBlock: newBlock
    });
  } else {
    res.json({
      note: 'New block rejected.',
      newBlock: newBlock
    });
  }
});


// register a node and broadcast it to the network
app.post('/register-and-broadcast-node', async (req, res) => {
  const newNodeUrl = req.body.newNodeUrl;
  if (!bitcoin.networkNodes.includes(newNodeUrl) && bitcoin.currentNodeUrl !== newNodeUrl) {
    bitcoin.networkNodes.push(newNodeUrl);
  }

  try {
    await Promise.all(bitcoin.networkNodes.map(networkNodeUrl =>
      axios.post(`${networkNodeUrl}/register-node`, { newNodeUrl })
    ));

    await axios.post(`${newNodeUrl}/register-nodes-bulk`, {
      allNetworkNodes: [...bitcoin.networkNodes, bitcoin.currentNodeUrl]
    }, { timeout: 5000 });

    res.json({ note: 'New node registered with network successfully.' });
  } catch (error) {
    console.error('Error during node registration:', error.message);
    res.status(500).json({ error: 'Error during node registration process.' });
  }
});

// register a node with the network
app.post('/register-node', (req, res) => {
  const { newNodeUrl } = req.body;
  if (!bitcoin.networkNodes.includes(newNodeUrl) && bitcoin.currentNodeUrl !== newNodeUrl) {
    bitcoin.networkNodes.push(newNodeUrl);
  }
  res.json({ note: 'New node registered successfully.' });
});

// register multiple nodes at once
app.post('/register-nodes-bulk', (req, res) => {
  const { allNetworkNodes } = req.body;
  allNetworkNodes.forEach(networkNodeUrl => {
    if (!bitcoin.networkNodes.includes(networkNodeUrl) && bitcoin.currentNodeUrl !== networkNodeUrl) {
      bitcoin.networkNodes.push(networkNodeUrl);
    }
  });
  res.json({ note: 'Bulk registration successful.' });
});

// consensus route to resolve conflicts
app.get('/consensus', async (req, res) => {
  try {
    const blockchains = await Promise.all(bitcoin.networkNodes.map(networkNodeUrl =>
      axios.get(`${networkNodeUrl}/blockchain`)
    ));

    const validChains = blockchains.filter(bc => bc.data && bitcoin.chainIsValid(bc.data.chain));
    const currentChainLength = bitcoin.chain.length;
    let newLongestChain = null;
    let newPendingTransactions = null;

    validChains.forEach(({ data }) => {
      if (data.chain.length > currentChainLength && bitcoin.chainIsValid(data.chain)) {
        newLongestChain = data.chain;
        newPendingTransactions = data.pendingTransactions;
      }
    });

    if (newLongestChain) {
      bitcoin.chain = newLongestChain;
      bitcoin.pendingTransactions = newPendingTransactions;
      res.json({ note: 'This chain has been replaced.', chain: bitcoin.chain });
    } else {
      res.json({ note: 'Current chain has not been replaced.', chain: bitcoin.chain });
    }
  } catch (error) {
    console.error('Error reaching consensus:', error.message);
    res.status(500).json({ note: 'Consensus error' });
  }
});

app.get('/block/:blockHash', function (req, res) {
  const blockHash = req.params.blockHash;
  const correctBlock = bitcoin.getBlock(blockHash);
  res.json({
    block: correctBlock
  });
});

app.get('/transaction/:transactionId', function (req, res) {
  const transactionId = req.params.transactionId;
  const transactionData = bitcoin.getTransaction(transactionId);
  res.json({
    transaction: transactionData.transaction,
    block: transactionData.block
  });
});

app.get('/address/:address', function (req, res) {
  const address = req.params.address;
  const addressData = bitcoin.getAddressData(address);
  res.json({
    addressData: addressData
  });
});

app.get('/block-explorer', function (req, res) {
  res.sendFile('./block-explorer/index.html', { root: __dirname });
});

app.listen(port, function () {
  console.log(`Listening on port ${port}...`);
});
