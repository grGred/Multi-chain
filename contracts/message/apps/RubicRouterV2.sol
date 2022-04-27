// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9;

import './TransferSwapV2.sol';
import './TransferSwapV3.sol';
import './TransferSwapInch.sol';
import './BridgeSwap.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import 'hardhat/console.sol';

contract RubicRouterV2 is TransferSwapV2, TransferSwapV3, TransferSwapInch, BridgeSwap, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using EnumerableSet for EnumerableSet.AddressSet;

    event SwapRequestDone(bytes32 id, uint256 dstAmount, SwapStatus status);

    constructor(
        address _messageBus,
        address[] memory _supportedDEXes,
        address _nativeWrap
    ) public {
        messageBus = _messageBus;
        for (uint256 i = 0; i < _supportedDEXes.length; i++) {
            supportedDEXes.add(_supportedDEXes[i]);
        }
        nativeWrap = _nativeWrap;
        dstCryptoFee[43114] = 10000000;
        // dstCryptoFee[250] = 10000000;
        //dstCryptoFee[56] = 10000000;
        feeRubic = 3000; // 0.3%
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(MANAGER, msg.sender);
        _setupRole(EXECUTOR, 0x645144372C15d5AA59E343353610Cc7C5A926289);
    }

    /**
     * @notice called by MessageBus when the tokens are checked to be arrived at this contract's address.
               sends the amount received to the receiver. swaps beforehand if swap behavior is defined in message
     * NOTE: if the swap fails, it sends the tokens received directly to the receiver as fallback behavior
     * @param _token the address of the token sent through the bridge
     * @param _amount the amount of tokens received at this contract through the cross-chain bridge
     * @param _srcChainId source chain ID
     * @param _message SwapRequestV2 message that defines the swap behavior on this destination chain
     */
    function executeMessageWithTransfer(
        address,
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message,
        address _executor
    )
        external
        payable
        override
        onlyMessageBus
        nonReentrant
        whenNotPaused
        onlyExecutor(_executor)
        returns (ExecutionStatus)
    {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));
        bytes32 id = _computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);

        _amount = _calculatePlatformFee(m.swap.integrator, _token, _amount);

        if (m.swap.version == SwapVersion.v3) {
            _executeDstSwapV3(_token, _amount, id, m);
        } else if (m.swap.version == SwapVersion.bridge) {
            _executeDstBridge(_token, _amount, id, m);
        } else {
            _executeDstSwapV2(_token, _amount, id, m);
        }

        // always return true since swap failure is already handled in-place
        return ExecutionStatus.Success;
    }

    /**
     * @notice called by MessageBus when the executeMessageWithTransfer call fails. does nothing but emitting a "fail" event
     * @param _srcChainId source chain ID
     * @param _message SwapRequest message that defines the swap behavior on this destination chain
     */
    function executeMessageWithTransferFallback(
        address, // _sender
        address _token,
        uint256 _amount,
        uint64 _srcChainId,
        bytes memory _message,
        address _executor
    )
        external
        payable
        override
        onlyMessageBus
        nonReentrant
        whenNotPaused
        onlyExecutor(_executor)
        returns (ExecutionStatus)
    {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));

        bytes32 id = _computeSwapRequestId(m.receiver, _srcChainId, uint64(block.chainid), _message);

        _sendToken(_token, _amount, m.receiver);

        emit SwapRequestDone(id, 0, SwapStatus.Failed);
        // always return Fail to mark this transfer as failed since if this function is called then there nothing more
        // we can do in this app as the swap failures are already handled in executeMessageWithTransfer
        return ExecutionStatus.Fail;
    }

    // called on source chain for handling of bridge failures (bad liquidity, bad slippage, etc...)
    function executeMessageWithTransferRefund(
        address _token,
        uint256 _amount,
        bytes calldata _message,
        address _executor
    )
        external
        payable
        override
        onlyMessageBus
        nonReentrant
        whenNotPaused
        onlyExecutor(_executor)
        returns (ExecutionStatus)
    {
        SwapRequestDest memory m = abi.decode((_message), (SwapRequestDest));

        bytes32 id = _computeSwapRequestId(m.receiver, uint64(block.chainid), m.dstChainId, _message);

        _sendToken(_token, _amount, m.receiver);

        emit SwapRequestDone(id, 0, SwapStatus.Succeeded);

        return ExecutionStatus.Success;
    }

    // no need to swap, directly send the bridged token to user
    function _executeDstBridge(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == _msgDst.swap.path[0],
            'bridged token must be the same as the first token in destination swap path'
        );
        require(_msgDst.swap.path.length == 1, 'dst bridge expected');
        _sendToken(_msgDst.swap.path[0], _amount, _msgDst.receiver);
        SwapStatus status = SwapStatus.Succeeded;
        emit SwapRequestDone(_id, _amount, status);
    }

    function _executeDstSwapV2(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == _msgDst.swap.path[0],
            'bridged token must be the same as the first token in destination swap path'
        );
        require(_msgDst.swap.path.length > 1, 'dst swap expected');

        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        SwapInfoV2 memory _dstSwap = SwapInfoV2({
            dex: _msgDst.swap.dex,
            path: _msgDst.swap.path,
            deadline: _msgDst.swap.deadline,
            amountOutMinimum: _msgDst.swap.amountOutMinimum
        });

        bool success;
        (success, dstAmount) = _trySwapV2(_dstSwap, _amount);
        if (success) {
            _sendToken(_dstSwap.path[_dstSwap.path.length - 1], dstAmount, _msgDst.receiver);
            status = SwapStatus.Succeeded;
        } else {
            // handle swap failure, send the received token directly to receiver
            _sendToken(_token, _amount, _msgDst.receiver);
            dstAmount = _amount;
            status = SwapStatus.Fallback;
        }

        status = SwapStatus.Succeeded;

        emit SwapRequestDone(_id, dstAmount, status);
    }

    function _executeDstSwapV3(
        address _token,
        uint256 _amount,
        bytes32 _id,
        SwapRequestDest memory _msgDst
    ) private {
        require(
            _token == address(_getFirstBytes20(_msgDst.swap.pathV3)),
            'bridged token must be the same as the first token in destination swap path'
        );
        require(_msgDst.swap.pathV3.length > 20, 'dst swap expected');

        uint256 dstAmount;
        SwapStatus status = SwapStatus.Succeeded;

        SwapInfoV3 memory _dstSwap = SwapInfoV3({
            dex: _msgDst.swap.dex,
            path: _msgDst.swap.pathV3,
            deadline: _msgDst.swap.deadline,
            amountOutMinimum: _msgDst.swap.amountOutMinimum
        });

        bool success;
        (success, dstAmount) = _trySwapV3(_dstSwap, _amount);
        if (success) {
            _sendToken(address(_getLastBytes20(_dstSwap.path)), dstAmount, _msgDst.receiver);
            status = SwapStatus.Succeeded;
        } else {
            // handle swap failure, send the received token directly to receiver
            _sendToken(_token, _amount, _msgDst.receiver);
            dstAmount = _amount;
            status = SwapStatus.Fallback;
        }

        emit SwapRequestDone(_id, dstAmount, status);
    }

    function _sendToken(
        address _token,
        uint256 _amount,
        address _receiver
    ) private {
        if (_token == nativeWrap) {
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = _receiver.call{value: _amount, gas: 50000}('');
            require(sent, 'failed to send native');
        } else {
            IERC20(_token).safeTransfer(_receiver, _amount);
        }
    }

    function setRubicFee(uint256 _feeRubic) external onlyManager {
        require(_feeRubic <= 1000000, 'incorrect fee amount');
        feeRubic = _feeRubic;
    }

    function setRubicShare(address _integrator, uint256 _percent) external onlyManager {
        require(_percent <= 1000000, 'incorrect fee amount');
//        require(_integrator != address(0));
        platformShare[_integrator] = _percent;
    }

    // set to 0 to remove integrator
    function setIntegrator(address _integrator, uint256 _percent) external onlyManager {
        require(_percent <= 1000000, 'incorrect fee amount');
//      require(_integrator != address(0));
        integratorFee[_integrator] = _percent;
    }

    function setCryptoFee(uint64 _networkID, uint256 _amount) external onlyManager {
        dstCryptoFee[_networkID] = _amount;
    }

    function addSupportedDex(address[] memory _dexes) external onlyManager {
        for (uint256 i = 0; i < _dexes.length; i++) {
            supportedDEXes.add(_dexes[i]);
        }
    }

    function removeSupportedDex(address[] memory _dexes) external onlyManager {
        for (uint256 i = 0; i < _dexes.length; i++) {
            supportedDEXes.remove(_dexes[i]);
        }
    }

    function getSupportedDEXes() public view returns (address[] memory dexes) {
        return supportedDEXes.values();
    }

    function sweepTokens(IERC20 token) external onlyManager {
        token.safeTransfer(msg.sender, token.balanceOf(address(this)));
    }

    // a person without fees collected will be reverted
    function integratorCollectFee(address _token, uint256 _amount) external {
        require(integratorCollectedFee[msg.sender][_token] <= _amount, 'not enough fees');
        if (_token == nativeWrap) {
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = payable(msg.sender).call{value: _amount, gas: 50000}('');
            require(sent, 'failed to send native');
        } else {
            IERC20(_token).safeTransfer(msg.sender, _amount);
        }
        integratorCollectedFee[msg.sender][_token] -= _amount;
    }

    function rubicCollectFee(address _token, uint256 _amount) external onlyManager {
        require(collectedFee[_token] <= _amount, 'amount to big');
        if (_token == nativeWrap) {
            IWETH(nativeWrap).withdraw(_amount);
            (bool sent, ) = payable(msg.sender).call{value: _amount, gas: 50000}('');
            require(sent, 'failed to send native');
        } else {
            IERC20(_token).safeTransfer(msg.sender, _amount);
        }
        collectedFee[_token] -= _amount;
    }

    function setNativeWrap(address _nativeWrap) external onlyManager {
        nativeWrap = _nativeWrap;
    }

    function setMessageBus(address _messageBus) public onlyManager {
        messageBus = _messageBus;
        emit MessageBusUpdated(messageBus);
    }
}
