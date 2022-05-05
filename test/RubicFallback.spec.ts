import { ethers, network, waffle } from 'hardhat';
import { swapContractFixtureInFork } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { RubicRouterV2, TestERC20, TestMessages, WETH9 } from '../typechain-types';
import { expect } from 'chai';
import {
    DEADLINE,
    DST_CHAIN_ID,
    VERSION,
    ZERO_ADDRESS,
    DEFAULT_AMOUNT_OUT_MIN,
    EXECUTOR_ADDRESS,
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
    let routerV3: string;
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
            _receiver = wallet.address
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
            dstChainId
        );
    }

    async function encodePath(tokens): Promise<string> {
        return tokens[0] + '000bb8' + tokens[1].slice(2);
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
            _nonce
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

    async function callExecuteMessageWithTransferRefund({
        tokenIn = transitToken.address,
        amountIn = DEFAULT_AMOUNT_IN_USDC,
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

        return _swapMain.executeMessageWithTransferRefund(tokenIn, amountIn, message, executor);
    }

    before('create fixture loader', async () => {
        [wallet, other] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader([wallet, other]);
        chainId = (await ethers.provider.getNetwork()).chainId;
    });

    beforeEach('deploy fixture', async () => {
        ({ swapMain, swapToken, transitToken, wnative, router, routerV3, testMessagesContract } =
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
                await transitToken.transfer(swapMain.address, ethers.BigNumber.from('1000000000'));
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

                it('Should successfully fallback token with failed bridge', async () => {
                    // const ID = await getID(
                    //     testMessagesContract,
                    //     (await swapMain.nonce()).add('1'),
                    //     {
                    //         dex: ZERO_ADDRESS,
                    //         version: 2,
                    //         path: [transitToken.address],
                    //         amountOutMinimum: ethers.BigNumber.from('0')
                    //     }
                    // );

                    const balanceBefore = await transitToken.balanceOf(wallet.address);

                    await expect(
                        await callExecuteMessageWithTransferFallback({
                            message: message
                        })
                    ).to.emit(swapMain, 'SwapRequestDone');
                    //.withArgs(ID, DEFAULT_AMOUNT_IN_USDC, '3');
                    const balanceAfter = await transitToken.balanceOf(wallet.address);
                    await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(balanceAfter);
                });

                it('Should successfully fallback token with failed V3', async () => {
                    nonce = (await swapMain.nonce()).add('1');

                    const path = await encodePath([transitToken.address, swapToken.address]);

                    message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                        dex: routerV3,
                        version: 1,
                        pathV3: path
                    });

                    const balanceBefore = await transitToken.balanceOf(wallet.address);

                    await expect(
                        await callExecuteMessageWithTransferFallback({
                            message: message
                        })
                    ).to.emit(swapMain, 'SwapRequestDone');
                    const balanceAfter = await transitToken.balanceOf(wallet.address);
                    await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(balanceAfter);
                });

                it('Should successfully fallback token with failed V2', async () => {
                    nonce = (await swapMain.nonce()).add('1');

                    message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                        dex: router,
                        version: 0,
                        path: [transitToken.address, swapToken.address]
                    });
                    const balanceBefore = await transitToken.balanceOf(wallet.address);
                    await expect(
                        await callExecuteMessageWithTransferFallback({
                            message: message
                        })
                    ).to.emit(swapMain, 'SwapRequestDone');
                    const balanceAfter = await transitToken.balanceOf(wallet.address);
                    await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(balanceAfter);
                });
            });

            describe('#executeMessageWithTransferRefund', () => {
                beforeEach('Setup for target executions', async () => {
                    // transfer 1000 USDC
                    await transitToken.transfer(swapMain.address, '1000000000');
                });
                describe('Refund should emit correct event in src chain', async () => {
                    let nonce: BN;
                    let message: string;

                    it('Should successfully refund token with failed bridge', async () => {
                        nonce = (await swapMain.nonce()).add('1');

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            dex: ZERO_ADDRESS,
                            version: 2,
                            path: [transitToken.address],
                            amountOutMinimum: ethers.BigNumber.from('0')
                        });

                        // const ID = await getID(
                        //     testMessagesContract,
                        //     (await swapMain.nonce()).add('1'),
                        //     {
                        //         dex: ZERO_ADDRESS,
                        //         version: 2,
                        //         path: [transitToken.address],
                        //         amountOutMinimum: ethers.BigNumber.from('0')
                        //     }
                        // );

                        const balanceBefore = await transitToken.balanceOf(wallet.address);

                        await expect(
                            await callExecuteMessageWithTransferRefund({
                                message: message
                            })
                        ).to.emit(swapMain, 'SwapRequestDone');
                        // .withArgs(ID, DEFAULT_AMOUNT_IN_USDC, '3');

                        const balanceAfter = await transitToken.balanceOf(wallet.address);
                        await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(
                            balanceAfter
                        );
                    });

                    it('Should successfully refund token with failed V3', async () => {
                        nonce = (await swapMain.nonce()).add('1');

                        const path = await encodePath([transitToken.address, swapToken.address]);

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            dex: routerV3,
                            version: 1,
                            pathV3: path
                        });
                        const balanceBefore = await transitToken.balanceOf(wallet.address);

                        await expect(
                            await callExecuteMessageWithTransferRefund({
                                message: message
                            })
                        ).to.emit(swapMain, 'SwapRequestDone');
                        const balanceAfter = await transitToken.balanceOf(wallet.address);
                        await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(
                            balanceAfter
                        );
                    });

                    it('Should successfully refund token with failed V2', async () => {
                        nonce = (await swapMain.nonce()).add('1');

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            dex: router,
                            version: 0,
                            path: [transitToken.address, swapToken.address]
                        });
                        const balanceBefore = await transitToken.balanceOf(wallet.address);
                        await expect(
                            await callExecuteMessageWithTransferRefund({
                                message: message
                            })
                        ).to.emit(swapMain, 'SwapRequestDone');
                        const balanceAfter = await transitToken.balanceOf(wallet.address);
                        await expect(balanceBefore.add(DEFAULT_AMOUNT_IN_USDC)).to.be.eq(
                            balanceAfter
                        );
                    });
                });
            });
        });
    });
});
