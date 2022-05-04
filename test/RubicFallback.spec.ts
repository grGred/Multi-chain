import { ethers, network, waffle } from 'hardhat';
import { swapContractFixtureInFork } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { RubicRouterV2, TestERC20, TestMessages, WETH9 } from '../typechain-types';
import { expect } from 'chai';
import {
    DEADLINE,
    DST_CHAIN_ID,
    DEFAULT_AMOUNT_IN,
    VERSION,
    ZERO_ADDRESS,
    DEFAULT_AMOUNT_OUT_MIN,
    EXECUTOR_ADDRESS,
    feeDecimals,
    INTEGRATOR,
    DEFAULT_AMOUNT_IN_USDC
} from './shared/consts';
import { BigNumber as BN, BigNumberish, ContractTransaction } from 'ethers';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

const envConfig = require('dotenv').config();
const {
    ROUTERS_POLYGON: TEST_ROUTERS,
    NATIVE_POLYGON: TEST_NATIVE,
    BUS_POLYGON_MAIN: TEST_BUS
} = envConfig.parsed || {};

describe('RubicFallback', () => {
    let wallet: Wallet, other: Wallet;
    let swapToken: TestERC20;
    let transitToken: TestERC20;
    let swapMain: RubicRouterV2;
    let router: string;
    let wnative: WETH9;
    let chainId: number;

    let testMessagesContract: TestMessages;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    async function getMessage(
        messagesContract: TestMessages,
        _nonce: BigNumberish,
        dstChainId: BigNumberish,
        {
            dex = router,
            integrator = INTEGRATOR,
            version = VERSION,
            path = [wnative.address, transitToken.address],
            pathV3 = '0x',
            deadline = DEADLINE,
            amountOutMinimum = DEFAULT_AMOUNT_OUT_MIN,
            _receiver = wallet.address,
            _nativeOut = false
        } = {}
    ): Promise<string> {
        return messagesContract.getMessage(
            {
                dex,
                integrator,
                version,
                path,
                pathV3,
                deadline,
                amountOutMinimum
            },
            _receiver,
            _nonce,
            dstChainId,
            _nativeOut
        );
    }

    async function getID(
        messagesContract: TestMessages,
        _nonce: BigNumberish,
        {
            dex = router,
            integrator = ZERO_ADDRESS,
            version = VERSION,
            path = [wnative.address, transitToken.address],
            pathV3 = '0x',
            deadline = DEADLINE,
            amountOutMinimum = DEFAULT_AMOUNT_OUT_MIN,
            _receiver = wallet.address,
            _nativeOut = false,
            _srcChainId = chainId,
            _dstChainId = DST_CHAIN_ID
        } = {}
    ): Promise<string> {
        return messagesContract.getID(
            _receiver,
            _srcChainId,
            _dstChainId,
            {
                dex,
                integrator,
                version,
                path,
                pathV3,
                deadline,
                amountOutMinimum
            },
            _nonce,
            _nativeOut
        );
    }

    async function callExecuteMessageWithTransferFallback({
        sender = ZERO_ADDRESS,
        tokenIn = transitToken.address,
        amountIn = DEFAULT_AMOUNT_IN_USDC,
        srcChainID = chainId,
        message = '0x',
        executor = EXECUTOR_ADDRESS
    } = {}): Promise<ContractTransaction> {
        await hre.network.provider.request({
            method: 'hardhat_impersonateAccount',
            params: [TEST_BUS]
        });

        const bus = await ethers.getSigner(TEST_BUS);

        await network.provider.send('hardhat_setBalance', [
            bus.address,
            '0x152D02C7E14AF6800000' // 100000 eth
        ]);

        const _swapMain = swapMain.connect(bus);

        return _swapMain.executeMessageWithTransferFallback(
            sender,
            tokenIn,
            amountIn,
            srcChainID,
            message,
            executor
            // { value: nativeIn === null ? cryptoFee.add(ethers.utils.parseEther('0.01')) : nativeIn }
        );
    }

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
        chainId = (await ethers.provider.getNetwork()).chainId;
    });

    beforeEach('deploy fixture', async () => {
        ({ swapMain, swapToken, transitToken, wnative, router, testMessagesContract } =
            await loadFixture(swapContractFixtureInFork));
    });

    it('constructor initializes', async () => {
        expect(await swapMain.nativeWrap()).to.eq(TEST_NATIVE);
        expect(await swapMain.messageBus()).to.eq(TEST_BUS);

        const routers = TEST_ROUTERS.split(',');
        expect(await swapMain.getSupportedDEXes()).to.deep.eq(routers);
    });

    describe('#Fallback and refund tests', () => {
        describe('#executeMessageWithTransferFallback', () => {
            beforeEach('Setup for target executions', async () => {
                // transfer 1000 USDC
                await transitToken.transfer(swapMain.address, 1000000000);
            });
            describe('Fallback should emit correct event in dst chain', async () => {
                let nonce: BN;
                let message: string;

                beforeEach('setup before fallback', async () => {
                    nonce = (await swapMain.nonce()).add('1');

                    message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                        dex: ZERO_ADDRESS,
                        version: 2,
                        path: [transitToken.address],
                        amountOutMinimum: ethers.BigNumber.from('0')
                    });
                });

                it('Should successfully send token with failed bridge', async () => {
                    const ID = await getID(
                        testMessagesContract,
                        (await swapMain.nonce()).add('1'),
                        {
                            dex: ZERO_ADDRESS,
                            version: 2,
                            path: [transitToken.address],
                            amountOutMinimum: ethers.BigNumber.from('0')
                        }
                    );

                    await expect(
                        await callExecuteMessageWithTransferFallback({
                            message: message
                        })
                    ).to.emit(swapMain, 'SwapRequestDone');
                    //.withArgs(ID, DEFAULT_AMOUNT_IN_USDC, '3');
                });

                // it('should successfully bridge native with rubic fee', async () => {
                //     await hre.network.provider.request({
                //         method: 'hardhat_impersonateAccount',
                //         params: [TEST_BUS]
                //     });
                //
                //     const bus = await ethers.getSigner(TEST_BUS);
                //
                //     await network.provider.send('hardhat_setBalance', [
                //         bus.address,
                //         '0x152D02C7E14AF6800000' // 100000 eth
                //     ]);
                //     const abiCoder = ethers.utils.defaultAbiCoder;
                //
                //     const storageBalancePositionWeth = ethers.utils.keccak256(
                //         abiCoder.encode(['address'], [bus.address]) +
                //             abiCoder.encode(['uint256'], [3]).slice(2, 66)
                //     );
                //
                //     await network.provider.send('hardhat_setStorageAt', [
                //         wnative.address,
                //         storageBalancePositionWeth,
                //         abiCoder.encode(['uint256'], [ethers.utils.parseEther('100000')])
                //     ]);
                //
                //     await wnative
                //         .connect(bus)
                //         .transfer(swapMain.address, ethers.utils.parseEther('1'));
                //
                //     const _swapMain = swapMain.connect(bus);
                //
                //     message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                //         dex: ZERO_ADDRESS,
                //         version: 2, // bridge version
                //         path: [wnative.address],
                //         amountOutMinimum: ethers.BigNumber.from('0') // not used
                //     });
                //
                //     let tokenBalanceBefore = await wnative.balanceOf(swapMain.address);
                //     await expect(
                //         _swapMain.executeMessageWithTransfer(
                //             ethers.constants.AddressZero,
                //             wnative.address,
                //             ethers.BigNumber.from('1000000000000000000'), // 1 ether
                //             DST_CHAIN_ID,
                //             message,
                //             EXECUTOR_ADDRESS
                //         )
                //     ).to.emit(swapMain, 'SwapRequestDone');
                //     let tokenBalanceAfter = await wnative.balanceOf(swapMain.address);
                //     // take only platform comission in transit token
                //     const platformFee = await _swapMain.feeRubic();
                //     await expect(Number(tokenBalanceAfter)).to.be.eq(
                //         (Number(tokenBalanceBefore) * Number(platformFee)) / feeDecimals
                //     );
                // });
                //
                // it('should fail bridge with incorrect path', async () => {
                //     await hre.network.provider.request({
                //         method: 'hardhat_impersonateAccount',
                //         params: [TEST_BUS]
                //     });
                //
                //     const bus = await ethers.getSigner(TEST_BUS);
                //
                //     await network.provider.send('hardhat_setBalance', [
                //         bus.address,
                //         '0x152D02C7E14AF6800000' // 100000 eth
                //     ]);
                //
                //     const _swapMain = swapMain.connect(bus);
                //
                //     message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                //         dex: ZERO_ADDRESS,
                //         version: 2, // bridge version
                //         path: [transitToken.address, wnative.address],
                //         amountOutMinimum: ethers.BigNumber.from('0') // not used
                //     });
                //
                //     await expect(
                //         _swapMain.executeMessageWithTransfer(
                //             ethers.constants.AddressZero,
                //             transitToken.address,
                //             ethers.BigNumber.from('1000000000'),
                //             DST_CHAIN_ID,
                //             message,
                //             EXECUTOR_ADDRESS
                //         )
                //     ).to.be.revertedWith('dst bridge expected');
                // });
                //
                // describe('target bridge should take integrator & rubic fee', async () => {
                //     beforeEach('set integrator and rubic fee', async () => {
                //         await swapMain.setIntegrator(INTEGRATOR, '3000'); // 0.3 %
                //         await swapMain.setRubicShare(INTEGRATOR, '500000'); // 50 % of integrator fee, 0.15 in total
                //
                //         message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                //             dex: ZERO_ADDRESS,
                //             version: 2, // bridge version
                //             path: [transitToken.address],
                //             amountOutMinimum: ethers.BigNumber.from('0') // not used
                //         });
                //     });
                //
                //     it('should successfully bridge transitToken with rubic & integrator fee', async () => {
                //         await hre.network.provider.request({
                //             method: 'hardhat_impersonateAccount',
                //             params: [TEST_BUS]
                //         });
                //
                //         const bus = await ethers.getSigner(TEST_BUS);
                //
                //         await network.provider.send('hardhat_setBalance', [
                //             bus.address,
                //             '0x152D02C7E14AF6800000' // 100000 eth
                //         ]);
                //
                //         const _swapMain = swapMain.connect(bus);
                //
                //         let tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);
                //         await expect(
                //             _swapMain.executeMessageWithTransfer(
                //                 ethers.constants.AddressZero,
                //                 transitToken.address,
                //                 ethers.BigNumber.from('1000000000'),
                //                 DST_CHAIN_ID,
                //                 message,
                //                 EXECUTOR_ADDRESS
                //             )
                //         ).to.emit(swapMain, 'SwapRequestDone');
                //
                //         const tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);
                //         const collectedFee1 = await swapMain.collectedFee(transitToken.address);
                //         const integratorCollectedFee1 = await swapMain.integratorCollectedFee(
                //             INTEGRATOR,
                //             transitToken.address
                //         );
                //
                //         const integratorFee =
                //             Number(await _swapMain.integratorFee(INTEGRATOR)) / feeDecimals;
                //         const platformFee =
                //             (integratorFee * Number(await _swapMain.platformShare(INTEGRATOR))) /
                //             feeDecimals;
                //
                //         await expect(Number(integratorCollectedFee1)).to.be.eq(
                //             Number(tokenBalanceBefore) * (Number(integratorFee) - platformFee)
                //         );
                //         // take platform comission in transit token
                //         await expect(Number(collectedFee1)).to.be.eq(
                //             Number(tokenBalanceBefore) * Number(platformFee)
                //         );
                //
                //         await expect(Number(tokenBalanceAfter)).to.be.eq(
                //             Number(integratorFee) * Number(tokenBalanceBefore)
                //         );
                //             });
                //         });
            });
        });
    });
});
