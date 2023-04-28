const { network, deployments, getNamedAccounts, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat.config");
const { expect, assert } = require("chai");

!developmentChains.includes(network.name)
  ? describe.skip("")
  : describe("Raffle unit tests", () => {
      const { chainId } = network.config;
      let raffleContract,
        vrfCoordinatorV2Mock,
        updateInterval,
        contractEntranceFee;

      beforeEach("Setup Contract", async () => {
        const { deployer } = await getNamedAccounts();
        await deployments.fixture(["all"]);
        const raffleDeployment = await deployments.get("Raffle");
        raffleContract = await ethers.getContractAt(
          "Raffle",
          raffleDeployment.address.toString()
        );
        const vrfCoordinatorV2MockDeployment = await deployments.get(
          "VRFCoordinatorV2Mock",
          deployer
        );
        vrfCoordinatorV2Mock = await ethers.getContractAt(
          "VRFCoordinatorV2Mock",
          vrfCoordinatorV2MockDeployment.address
        );
        updateInterval = await raffleContract.getUpdateInterval();
        contractEntranceFee = await raffleContract.getEntranceFee();
      });

      describe("Testing the CONSTRUCTOR...", () => {
        it("Has the correct entrance fee", async () => {
          const { entranceFee } = networkConfig[chainId];
          assert(contractEntranceFee.toString() === entranceFee.toString());
        });

        it("Has the correct raffle state", async () => {
          const contractRaffleState = await raffleContract.getRaffleState();
          assert(contractRaffleState.toString() === "0");
        });

        it("Has the correct update interval", async () => {
          const contractUpdateInterval =
            await raffleContract.getUpdateInterval();
          const { updateInterval } = networkConfig[chainId];
          assert(contractUpdateInterval.toString() === updateInterval);
        });
      });

      describe("Test the ENTER_RAFFLE function...", () => {
        const contractEntranceFee = networkConfig[chainId].entranceFee;

        it("Reverts when the sender value entrance fee", async () => {
          const entranceFee = ethers.utils.parseEther("0.005");
          await expect(
            raffleContract.enterRaffle({ value: entranceFee })
          ).to.be.revertedWithCustomError(
            raffleContract,
            "Raffle__NotEnoughEth"
          );
        });

        it("Adds the player to the s_players array after player enters raffle", async () => {
          const transactionResponse = await raffleContract.enterRaffle({
            value: contractEntranceFee,
          });
          await transactionResponse.wait(1);
          const onlyPlayer = await raffleContract.getPlayers("0");
          const { deployer } = await getNamedAccounts();
          assert(onlyPlayer === deployer);
        });

        it("Reverts when the raffle is closed", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });

          // Mock the timer on the chainlink keeper
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);

          await raffleContract.performUpkeep([]);
          await expect(
            raffleContract.enterRaffle({ value: contractEntranceFee })
          ).to.be.revertedWithCustomError(raffleContract, "Raffle__NotOpen");
        });

        it("Emmits an event with the players address", async () => {
          /* const transactionResponse = await raffleContract.enterRaffle({
            value: contractEntranceFee,
          });
          const transactionReceipt = await transactionResponse.wait(1);
          const emmitedEvent = transactionReceipt.events[0];
          const { deployer } = await getNamedAccounts();
          assert(emmitedEvent.args[0] === deployer); */

          await expect(
            raffleContract.enterRaffle({ value: contractEntranceFee })
          ).to.emit(raffleContract, "RaffleEnter");
        });
      });

      describe("Testing the CHECK_UPKEEP function...", () => {
        it("Should return false if no eth has been sent or no players", async () => {
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          );
          const numPlayers = await raffleContract.getNumPlayers();
          assert(!upKeepNeeded);
          assert(numPlayers.toString() === "0");
        });
        it("Should return false if raffle isn't open", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await raffleContract.performUpkeep("0x");
          const raffleState = await raffleContract.getRaffleState();
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          );
          assert(!upKeepNeeded);
          assert(raffleState.toString() === "1");
        });
        it("Should return false if interval has not been exceeded", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() - 5,
          ]);
          await network.provider.send("evm_mine", []);
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          );
          assert(!upKeepNeeded);
        });
        it("Should return true if eth has been sent by a player, interval has been exceeded and raffle is open", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const { upKeepNeeded } = await raffleContract.callStatic.checkUpkeep(
            "0x"
          );
          assert(upKeepNeeded);
        });
      });

      describe("Testing PERFORM_UPKEEP function...", () => {
        it("Reverts when upkeep is not needed", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await expect(
            raffleContract.performUpkeep("0x")
          ).to.be.revertedWithCustomError(
            raffleContract,
            "Raffle__UpkeepNotNeeded"
          );
        });
        it("Runs when checkupkeep is needed", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const transactionResponse = await raffleContract.performUpkeep("0x");
          assert(transactionResponse);
        });
        it("Calls the vrf function by emmiting the request Id", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          await expect(raffleContract.performUpkeep("0x")).to.emit(
            raffleContract,
            "RequestedRaffleWinner"
          );
        });
        it("changes the state of the raffle draw to calculating", async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
          const transactionResponse = await raffleContract.performUpkeep("0x");
          await transactionResponse.wait(1);
          const raffleState = await raffleContract.getRaffleState();
          assert(raffleState.toString() === "1");
        });
      });

      describe("Testing the FULFILL_RANDOM_WORDS function...", () => {
        beforeEach(async () => {
          await raffleContract.enterRaffle({ value: contractEntranceFee });
          await network.provider.send("evm_increaseTime", [
            updateInterval.toNumber() + 1,
          ]);
          await network.provider.send("evm_mine", []);
        });

        it("Reverts when a request ID is non existent", async () => {
          await expect(
            vrfCoordinatorV2Mock.fulfillRandomWords(0, raffleContract.address)
          ).to.be.revertedWith("nonexistent request");
        });

        // Final test
        it("Picks a winner, sends the winner money and resets the lottery", async () => {
          const additionalEntrants = 3;
          const startingAccountIndex = 1;
          const accounts = await ethers.getSigners();

          for (
            let i = startingAccountIndex;
            i < startingAccountIndex + additionalEntrants;
            i++
          ) {
            const accountConnectedToRaffle = await raffleContract.connect(
              accounts[i]
            );
            await accountConnectedToRaffle.enterRaffle({
              value: contractEntranceFee,
            });
          }

          const startingTimeStamp = await raffleContract.getLatestTimestamp();

          await new Promise(async (resolve, reject) => {
            // Setup listener for when winner gets picked
            raffleContract.once("WinnerPicked", async (winner) => {
              try {
                const recentWinner = await raffleContract.getRecentWinner();
                const raffleState = await raffleContract.getRaffleState();
                const endingTimeStamp =
                  await raffleContract.getLatestTimestamp();
                const numPlayers = await raffleContract.getNumPlayers();

                assert(numPlayers.toString() === "0");
                assert(recentWinner);
                assert(raffleState.toString() === "0");
                assert(endingTimeStamp > startingTimeStamp);
              } catch (e) {
                reject(e);
              }
              resolve();
            });

            try {
              const transactionResponse = await raffleContract.performUpkeep(
                []
              );
              const transactionReceipt = await transactionResponse.wait(1);
              const requestId = transactionReceipt.events[1].args.requestId;
              const contractAddress = raffleContract.address;
              await vrfCoordinatorV2Mock.fulfillRandomWords(
                requestId,
                contractAddress
              );
            } catch (e) {
              //console.log(e);
              reject(e);
              //process.exit(1);
            }
          });
        });
      });
    });
