const { Web3 } = require('web3');
const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');

const web3 = new Web3("http://127.0.0.1:7545");
const contractJson = JSON.parse(fs.readFileSync('./build/contracts/RideShare.json', 'utf8'));
const abi = contractJson.abi;
const bytecode = contractJson.bytecode;

let rideContracts = [];

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.engine('html', require('ejs').renderFile);
app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render(__dirname + "/views/index.html");
});

app.get('/driver', (req, res) => {
  res.render(__dirname + "/views/driver.html", { wallet: getWallet(req) });
});

app.post('/driver/create-ride', async (req, res) => {
  const contractAddress = await createDrive(getWallet(req), req.body.amount, req.body.start, req.body.destination);
  if (contractAddress){
    res.redirect(`/ride/${contractAddress}`);
  }
  else {
    res.send('Error creating ride. Please try again.');
  }
});

app.post('/driver/start-ride', async (req, res) => {
  res.send(JSON.stringify({ rideStarted: await startRide(getWallet(req), req.body.contractAddress) }));
});

app.post('/ride-status', async (req, res) => {
  const contractAddress = req.body.contractAddress;
  const contract = new web3.eth.Contract(abi, contractAddress);
  const rider = await contract.methods.rider().call();
  const rideStarted = await contract.methods.rideStarted().call();
  const rideFinished = await contract.methods.rideFinished().call();
  res.send(JSON.stringify({ rideFinished: rideFinished, rideStarted: rideStarted, rider: rider}));
});

app.post('/finish-ride', async (req, res) => {
  res.send(JSON.stringify({ rideFinished: await finishRide(getWallet(req), req.body.contractAddress) }));
  console.log('Ride finished successfully', getWallet(req));
});

app.get('/passenger', async (req, res) => {
  res.render(__dirname + "/views/rides.html", {wallet: getWallet(req), rideContracts: await listRides() });
});

app.post('/passenger/accept-ride', async (req, res) => {
  res.send(JSON.stringify({ contractAddress: await acceptRide(getWallet(req), req.body.contractAddress) }));
});

app.get('/ride/:contractAddress', async (req, res) => {
  const contractAddress = req.params.contractAddress;
  const contract = new web3.eth.Contract(abi, contractAddress);
  const wallet = getWallet(req)
  const driver = await contract.methods.driver().call();
  const rider = await contract.methods.rider().call();
  const rideAmount = await contract.methods.rideAmount().call();
  const amount = web3.utils.fromWei(rideAmount, 'ether');
  const start = await contract.methods.start().call();
  const destination = await contract.methods.destination().call();
  const rideStarted = await contract.methods.rideStarted().call();
  const rideFinished = await contract.methods.rideFinished().call();
  res.render(__dirname + "/views/ride.html", { title: "Passenger Page", wallet: wallet, driver: driver, rider: rider, amount: amount, start: start, 
  destination: destination, rideStarted: rideStarted, rideFinished: rideFinished, contractAddress: contractAddress, isDriver: wallet === driver});
});

const getWallet = ((req) => {
  try{
    return req.headers.cookie.split('; ').find((row) => row.startsWith("wallet="))?.split("=")[1]
  } catch (error) {
    return null;
  }
});

const createDrive = async (wallet, amount, start, end) => {
  const accounts = await web3.eth.getAccounts();
  if (accounts.includes(wallet)) {
    const contract = new web3.eth.Contract(abi);
    const amtETH = web3.utils.toWei(amount.toString(), 'ether');
    const deployedContract = await contract.deploy({
      data: bytecode,
      arguments: [amtETH, start, end]
    }).send({
      from: wallet,
      gas: 3000000
    });
    console.log('Contract deployed at address:', deployedContract.options.address);
    rideContracts.push({ 'contractAddress': deployedContract.options.address, 'driver': wallet, 'amount': amount, 'start': start, 'destination': end });
    return deployedContract.options.address;
  } else {
    console.log('Invalid Wallet Address');
    return false;
  }
}

const acceptRide = async (wallet, contractAddress) => {
  const contract = new web3.eth.Contract(abi, contractAddress);
  const rider = await contract.methods.rider().call();
  if (rider !== "0x0000000000000000000000000000000000000000") {
    return false;
  }
  const amount = await contract.methods.rideAmount().call();
  const tx = {
    from: wallet,
    to: contractAddress,
    value: amount,
    gas: 3000000,
    data: contract.methods.acceptRide().encodeABI()
  };
  try {
    const receipt = await web3.eth.sendTransaction(tx);
    console.log(contractAddress);
    return contractAddress;
  } catch (error) {
    console.error('Error accepting ride:', error);
    return false;
  }
};

const startRide = async (wallet, contractAddress) => {
  const contract = new web3.eth.Contract(abi, contractAddress);
  const rider = await contract.methods.rider().call();
  if (rider === "0x0000000000000000000000000000000000000000") {
    return false;
  }
  await contract.methods.startRide().send({
    from: wallet,
    gas: 3000000
  });
  return true;
};

const finishRide = async (wallet, contractAddress) => {
  const contract = new web3.eth.Contract(abi, contractAddress);
  const rideFinished = await contract.methods.rideFinished().call();
  const riderWallet = await contract.methods.rider().call();
  if ((rideFinished && wallet !== riderWallet)) {
    return;
  }
  await contract.methods.finishRide().send({
    from: wallet,
    gas: 3000000
  });
  return true;
};

const listRides = async () => {
  const results = await Promise.all(rideContracts.map(async (ride) => {
    try {
      const contract = new web3.eth.Contract(abi, ride.contractAddress);
      const hasRider = await contract.methods.rider().call();
      return { ride, hasRider: hasRider == "0x0000000000000000000000000000000000000000" };
    } catch (error) {
      console.log(error);
      return { ride, hasRider: false };
    }
  }));
  rideContracts = results.filter(result => result.hasRider).map(result => result.ride);
  return rideContracts;
};


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on  http://localhost:${PORT}`));