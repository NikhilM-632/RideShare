// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

contract RideShare {
    address payable public driver;
    address payable public rider;
    uint256 public rideAmount;
    string public start;
    string public destination;
    bool public rideStarted = false;
    bool public rideFinished = false;

    constructor(uint256 _rideAmount, string memory _start, string memory _destination) public {
        driver = payable(msg.sender);
        rideAmount = _rideAmount;
        start = _start;
        destination = _destination;
    }

    function acceptRide() public payable {
        require(msg.value == rideAmount, "Payment must match the ride amount.");
        require(!rideStarted, "The ride has started.");
        rider = msg.sender;
    }

    function startRide() public{
        require(msg.sender == driver, "Only the driver can start the ride.");
        rideStarted = true;
    }

    function finishRide() public {
        require(msg.sender == driver || msg.sender == rider, "Only the driver or the rider can finish the ride.");
        require(rideStarted, "The ride must be started.");

        if (msg.sender == driver) {
            rideFinished = true;
        } else if (msg.sender == rider && rideFinished) {
            driver.transfer(rideAmount);
        }
    }
}
