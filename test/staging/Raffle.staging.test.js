const { network, deployments, getNamedAccounts, ethers } = require("hardhat");
const {
  developmentChains,
  networkConfig,
} = require("../../helper-hardhat.config");
const { expect, assert } = require("chai");

developmentChains.includes(network.name)
  ? describe.skip("")
  : describe("Raffle unit tests", () => {
      let raffleContract, contractEntranceFee;

      beforeEach("Setup Contract", async () => {
        const { deployer } = await getNamedAccounts();
        const raffleDeployment = await deployments.get("Raffle");
        raffleContract = await ethers.getContractAt(
          "Raffle",
          raffleDeployment.address.toString()
        );
        contractEntranceFee = await raffleContract.getEntranceFee();
      });

      describe("Testing the FULFILL_RANDOM_WORDS function...", () => {
        it("Works on a testnet and cahinlink vrf", async () => {
          const startingTimeStamp = await raffleContract.getLatestTimestamp();
          const accounts = await ethers.getSigners();
          let winnerEndingBalance, winnerStartingBalance;

          await new Promise(async (resolve, reject) => {
            // Setup listener for when winner gets picked
            raffleContract.once("WinnerPicked", async (winner) => {
              console.log(`Winner is ${winner}!`);
              try {
                const recentWinner = await raffleContract.getRecentWinner();
                const raffleState = await raffleContract.getRaffleState();
                winnerEndingBalance = await accounts[0].getBalance();
                const endingTimeStamp =
                  await raffleContract.getLatestTimestamp();
                const numPlayers = await raffleContract.getNumPlayers();

                assert.equal(numPlayers.toString(), "0");
                assert.equal(recentWinner.toString(), accounts[0].address);
                assert.equal(raffleState.toString(), "0");
                assert.equal(
                  winnerEndingBalance.toString(),
                  winnerStartingBalance.add(contractEntranceFee).toString()
                );
                assert(endingTimeStamp > startingTimeStamp);

                resolve();
              } catch (e) {
                reject(e);
              }
              resolve();
            });

            try {
              console.log("Entered Raffle...");
              const txResponse = await raffleContract.enterRaffle({
                value: contractEntranceFee,
              });
              await txResponse.wait(1);
              winnerStartingBalance = await accounts[0].getBalance();
            } catch {
              reject(e);
            }
          });
        });
      });
    });
