// SPDX-License-Identifier: GPL-3.0-only

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "sgn-v2-contracts/contracts/message/libraries/MessageSenderLib.sol";

contract SimpleBatchTransfer {
    using SafeERC20 for IERC20;
        
    struct TransferRequest {
        address[] accounts;
        uint256[] amounts;
    }

    uint64 nonce;
    address messageBus;

    // functions in the destination chain contract handles funds and we want to make sure only MessageBus can call it
    modifier onlyMessageBus() {
        require(msg.sender == messageBus, "caller is not message bus");
        _;
    }

    constructor(address _messageBus) {
        messageBus = _messageBus; // we need to know where to send the messages
    }

    function batchTransfer(
        address _receiver, // destination contract address
        address _token, // the input token
        uint256 _amount, // the input token amount
        uint64 _dstChainId, // destination chain id
        uint32 _maxSlippage, // the max amount of slippage allowed at bridge, represented in 1e6 as 100% (i.e. 1e4 = 1%)
        MessageSenderLib.BridgeType _bridgeType, // the bridge type, for this tutorial, we are using liquidity bridge
        address[] calldata _accounts, // the accounts on the destination chain that should receive the transfered fund
        uint256[] calldata _amounts // the amounts for each account
    ) external payable {
        // each transfer is assigned a nonce
        nonce += 1;
        
        // pull funds from the sender
        IERC20(_token).safeTransferFrom(msg.sender, address(this), _amount);
        
        // encode a message, specifying how we want to distribute the funds on the destination chain
        bytes memory message = abi.encode(
            TransferRequest({accounts: _accounts, amounts: _amounts})
        );
        
        // MessageSenderLib is your swiss army knife of sending messages
        MessageSenderLib.sendMessageWithTransfer(
            _receiver,
            _token,
            _amount,
            _dstChainId,
            nonce,
            _maxSlippage,
            message,
            _bridgeType,
            messageBus,
            msg.value
        );
    }

    function executeMessageWithTransfer(
        address _sender,
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message
    ) external onlyMessageBus returns (bool) {
        // decode the message
        TransferRequest memory transfer = abi.decode((_message), (TransferRequest));
        // distribute the funds transfered
        for (uint256 i = 0; i < transfer.accounts.length; i++) {
            IERC20(_token).safeTransfer(transfer.accounts[i], transfer.amounts[i]);
        }
        // returning true indicates that the handling is successful
        return true;
    }
}