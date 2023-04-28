const { network, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../helper-hardhat.config");
const { verify } = require("../utils/verify");

const FUND_AMOUNT = ethers.utils.parseEther("1");

module.exports = async function ({ getNamedAccounts, deployments }) {
  const { deploy, log } = deployments;
  const { deployer } = await getNamedAccounts();
  const { chainId } = network.config;

  const entranceFee = networkConfig[chainId].entranceFee;
  const gasLane = networkConfig[chainId].gasLane;
  const callBackGasLimit = networkConfig[chainId].callBackGasLimit;
  const updateInterval = networkConfig[chainId].updateInterval;
  let vrfCoordinatorV2Mock, vrfCoordinatorV2Address, subscriptionId;

  if (developmentChains.includes(network.name)) {
    const vrfCoordinatorV2MockDeployment = await deployments.get(
      "VRFCoordinatorV2Mock"
    );
    vrfCoordinatorV2Mock = await ethers.getContractAt(
      "VRFCoordinatorV2Mock",
      vrfCoordinatorV2MockDeployment.address
    );
    vrfCoordinatorV2Address = vrfCoordinatorV2Mock.address;

    /* Create and fund a subscription programatically */
    const transactionResponse = await vrfCoordinatorV2Mock.createSubscription();
    const transactionReceipt = await transactionResponse.wait(1);
    subscriptionId = transactionReceipt.events[0].args.subId;
    await vrfCoordinatorV2Mock.fundSubscription(subscriptionId, FUND_AMOUNT);
  } else {
    vrfCoordinatorV2Address = networkConfig[chainId].vrfCoordinatorV2;
    subscriptionId = networkConfig[chainId].subscriptionId;
  }

  const args = [
    vrfCoordinatorV2Address,
    entranceFee,
    gasLane,
    subscriptionId,
    callBackGasLimit,
    updateInterval,
  ];

  // Deploy raffle contract
  const raffleContract = await deploy("Raffle", {
    from: deployer,
    args,
    log: true,
    waitConfirmations: network.config.waitConfirmations || 1,
  });

  // Add consumer contract address for chainlink vrf mock
  if (developmentChains.includes(network.name)) {
    await vrfCoordinatorV2Mock.addConsumer(
      subscriptionId,
      raffleContract.address
    );
  }

  if (
    !developmentChains.includes(network.name) &&
    process.env.ETHERSCAN_API_KEY
  ) {
    await verify(raffleContract.address, args);
  }
  log("Raffle Deployed!");
};

module.exports.tags = ["all", "raffle"];
