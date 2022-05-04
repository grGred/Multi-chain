import { ethers, network, waffle } from 'hardhat';
import { swapContractFixtureInFork } from './shared/fixtures';
import { Wallet } from '@ethersproject/wallet';
import { RubicRouterV2, TestERC20, TestMessages, WETH9 } from '../typechain-types';
import { expect } from 'chai';
import {
    DEADLINE,
    DST_CHAIN_ID,
    DEFAULT_AMOUNT_IN,
    VERSION_V2,
    ZERO_ADDRESS,
    DEFAULT_AMOUNT_OUT_MIN,
    EXECUTOR_ADDRESS,
    INTEGRATOR,
    feeDecimals,
    DEFAULT_AMOUNT_IN_USDC
} from './shared/consts';
import { BigNumber as BN, BigNumberish, ContractTransaction } from 'ethers';
import { getRouterV2 } from './shared/utils';
const hre = require('hardhat');

const createFixtureLoader = waffle.createFixtureLoader;

const envConfig = require('dotenv').config();
const {
    ROUTERS_POLYGON: TEST_ROUTERS,
    NATIVE_POLYGON: TEST_NATIVE,
    BUS_POLYGON_MAIN: TEST_BUS
} = envConfig.parsed || {};

describe('RubicCrossChainV2', () => {
    let wallet: Wallet, other: Wallet;
    let swapToken: TestERC20;
    let transitToken: TestERC20;
    let swapMain: RubicRouterV2;
    let router: string;
    let wnative: WETH9;
    let chainId: number;

    let testMessagesContract: TestMessages;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    async function callTransferWithSwapV2Native(
        amountOutMinimum: BigNumberish,
        {
            receiver = null,
            amountIn = DEFAULT_AMOUNT_IN,
            dstChainID = DST_CHAIN_ID,
            srcDEX = router,
            srcPath = [wnative.address, transitToken.address],
            nativeOut = false,
            nativeIn = null,
            integrator = INTEGRATOR
        } = {}
    ): Promise<ContractTransaction> {
        const cryptoFee = await swapMain.dstCryptoFee(dstChainID);

        return swapMain.transferWithSwapV2Native(
            receiver === null ? wallet.address : receiver,
            amountIn,
            dstChainID,
            {
                dex: srcDEX,
                path: srcPath,
                deadline: DEADLINE,
                amountOutMinimum
            },
            {
                dex: router,
                integrator: integrator,
                version: VERSION_V2,
                path: [wnative.address, transitToken.address],
                pathV3: '0x',
                deadline: DEADLINE,
                amountOutMinimum: DEFAULT_AMOUNT_OUT_MIN
            },
            '10000',
            nativeOut,
            {
                value:
                    nativeIn === null
                        ? amountIn.add(cryptoFee).add(ethers.utils.parseEther('0.1'))
                        : nativeIn
            }
        );
    }

    async function callTransferWithSwapV2(
        amountOutMinimum: BigNumberish,
        {
            receiver = null,
            amountIn = DEFAULT_AMOUNT_IN,
            dstChainID = DST_CHAIN_ID,
            srcDEX = router,
            srcPath = [wnative.address, transitToken.address],
            nativeOut = false,
            nativeIn = null,
            integrator = INTEGRATOR
        } = {}
    ): Promise<ContractTransaction> {
        const cryptoFee = await swapMain.dstCryptoFee(dstChainID);

        return swapMain.transferWithSwapV2(
            receiver === null ? wallet.address : receiver,
            amountIn,
            dstChainID,
            {
                dex: srcDEX,
                path: srcPath,
                deadline: DEADLINE,
                amountOutMinimum
            },
            {
                dex: router,
                integrator: integrator,
                version: VERSION_V2,
                path: [wnative.address, transitToken.address],
                pathV3: '0x',
                deadline: DEADLINE,
                amountOutMinimum: DEFAULT_AMOUNT_OUT_MIN
            },
            '10000',
            nativeOut,
            { value: nativeIn === null ? cryptoFee.add(ethers.utils.parseEther('0.01')) : nativeIn }
        );
    }

    async function getAmountOutMin(
        amountIn = DEFAULT_AMOUNT_IN,
        path = [wnative.address, transitToken.address]
    ) {
        const routerV2 = await getRouterV2(wallet, router);

        return (await routerV2.getAmountsOut(amountIn, path))[1];
    }

    // async function getAmountIn(
    //     amountOut = DEFAULT_AMOUNT_OUT_MIN,
    //     path = [transitToken.address, swapToken.address]
    // ) {
    //     const routerV2 = await getRouterV2(wallet, router);
    //     return (await routerV2.getAmountsIn(amountOut, path))[0];
    // }

    async function getMessage(
        messagesContract: TestMessages,
        _nonce: BigNumberish,
        dstChainId: BigNumberish,
        {
            dex = router,
            integrator = INTEGRATOR,
            version = VERSION_V2,
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
            integrator = INTEGRATOR,
            version = VERSION_V2,
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

    describe('#WithSwapTests', () => {
        describe('#transferWithSwapV2Native', () => {
            it('Should swap native to token and transfer through Celer', async () => {
                await swapMain.setMaxSwapAmount(
                    transitToken.address,
                    ethers.utils.parseEther('1000')
                );

                const amountOutMin = await getAmountOutMin(
                    ethers.BigNumber.from('20000000000000000000')
                );
                const _amountIn = ethers.BigNumber.from('20000000000000000000');

                await expect(
                    callTransferWithSwapV2Native(amountOutMin, {
                        amountIn: _amountIn,
                        srcPath: [wnative.address, transitToken.address]
                    })
                ).to.emit(swapMain, 'SwapRequestSentV2');
            });
            it('Should swap native to token and fail transfer through Celer', async () => {
                await swapMain.setMaxSwapAmount(
                    transitToken.address,
                    ethers.utils.parseEther('1000')
                );

                const amountOutMin = await getAmountOutMin();

                await expect(
                    callTransferWithSwapV2Native(amountOutMin, {
                        srcPath: [wnative.address, transitToken.address]
                    })
                ).to.be.revertedWith('amount too small');
            });
        });
        describe('#transferWithSwapV2', () => {
            it('Should swap token to transitToken and transfer through Сeler', async () => {
                await swapToken.approve(swapMain.address, ethers.constants.MaxUint256);
                await swapMain.setMaxSwapAmount(
                    transitToken.address,
                    ethers.utils.parseEther('1000')
                );

                const amountOutMin = await getAmountOutMin(DEFAULT_AMOUNT_IN, [
                    swapToken.address,
                    transitToken.address
                ]);

                const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));

                await expect(
                    callTransferWithSwapV2(amountOutMin, {
                        srcPath: [swapToken.address, transitToken.address]
                    })
                )
                    .to.emit(swapMain, 'SwapRequestSentV2')
                    .withArgs(ID, DST_CHAIN_ID, DEFAULT_AMOUNT_IN, swapToken.address);
            });

            it('Should swap token to native and transfer through Сeler', async () => {
                await swapToken.approve(swapMain.address, ethers.constants.MaxUint256);
                await swapMain.setMaxSwapAmount(wnative.address, ethers.utils.parseEther('10000'));

                // amountIn is 100$
                const amountOutMin = await getAmountOutMin(DEFAULT_AMOUNT_IN_USDC, [
                    swapToken.address,
                    wnative.address
                ]);

                const ID = await getID(testMessagesContract, (await swapMain.nonce()).add('1'));

                await expect(
                    callTransferWithSwapV2(amountOutMin, {
                        srcPath: [swapToken.address, wnative.address]
                    })
                )
                    .to.emit(swapMain, 'SwapRequestSentV2')
                    .withArgs(ID, DST_CHAIN_ID, DEFAULT_AMOUNT_IN, swapToken.address);
            });
        });
        describe('#executeMessageWithTransfer', () => {
            beforeEach('setup for target executions', async () => {
                // transfer 1000 USDC
                await transitToken.transfer(swapMain.address, 1000000000);
            });
            describe('target swap should emit correct event', async () => {
                let nonce: BN;
                let message: string;

                beforeEach('setup before swap', async () => {
                    nonce = (await swapMain.nonce()).add('1');

                    message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                        path: [transitToken.address, swapToken.address],
                        amountOutMinimum: ethers.BigNumber.from('200000000000000000') // 0.2 eth for 1000$ is min
                    });
                });
                it('should successfully swap V2 with rubic fee', async () => {
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

                    let tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);
                    await expect(
                        _swapMain.executeMessageWithTransfer(
                            ethers.constants.AddressZero,
                            transitToken.address,
                            ethers.BigNumber.from('1000000000'),
                            DST_CHAIN_ID,
                            message,
                            EXECUTOR_ADDRESS
                        )
                    ).to.emit(swapMain, 'SwapRequestDone');
                    let tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);
                    // take only platform comission in transit token
                    const platformFee = Number(await _swapMain.feeRubic()) / feeDecimals;
                    await expect(Number(tokenBalanceAfter)).to.be.eq(
                        Number(tokenBalanceBefore) * platformFee
                    );
                });

                it('should fail swap V2 with rubic fee and transfer tokens', async () => {
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

                    message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                        path: [transitToken.address, swapToken.address],
                        amountOutMinimum: ethers.BigNumber.from('2000000000000000000') // 2 eth for 1000$ is minOut, too much
                    });

                    const tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);
                    await expect(
                        _swapMain.executeMessageWithTransfer(
                            ethers.constants.AddressZero,
                            transitToken.address,
                            ethers.BigNumber.from('1000000000'),
                            DST_CHAIN_ID,
                            message,
                            EXECUTOR_ADDRESS
                        )
                    ).to.emit(swapMain, 'SwapRequestDone');

                    const tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);

                    // take only platform comission in transit token
                    const platformFee = Number(await _swapMain.feeRubic()) / feeDecimals;
                    await expect(Number(tokenBalanceAfter)).to.be.eq(
                        Number(tokenBalanceBefore) * platformFee
                    );

                    const collectedFee1 = await swapMain.collectedFee(transitToken.address);

                    await expect(Number(collectedFee1)).to.be.eq(
                        Number(tokenBalanceBefore) * platformFee
                    );
                    const integratorCollectedFee1 = await swapMain.integratorCollectedFee(
                        INTEGRATOR,
                        transitToken.address
                    );
                    await expect(Number(integratorCollectedFee1)).to.be.eq(0);
                });

                describe('target swap should take integrator & rubic fee', async () => {
                    beforeEach('set integrator and rubic fee', async () => {
                        await swapMain.setIntegrator(INTEGRATOR, '3000'); // 0.3 %
                        await swapMain.setRubicShare(INTEGRATOR, '500000'); // 50 % of integrator fee, 0.15 in total

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            path: [transitToken.address, swapToken.address],
                            amountOutMinimum: ethers.BigNumber.from('200000000000000000') // 0.2 eth for 1000$ is minOut, too much
                        });
                    });

                    it('should successfully swapV2 token to token with rubic & integrator fee', async () => {
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

                        let tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);
                        await expect(
                            _swapMain.executeMessageWithTransfer(
                                ethers.constants.AddressZero,
                                transitToken.address,
                                ethers.BigNumber.from('1000000000'),
                                DST_CHAIN_ID,
                                message,
                                EXECUTOR_ADDRESS
                            )
                        ).to.emit(swapMain, 'SwapRequestDone');
                        const tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);
                        const collectedFee1 = await swapMain.collectedFee(transitToken.address);
                        const integratorCollectedFee1 = await swapMain.integratorCollectedFee(
                            INTEGRATOR,
                            transitToken.address
                        );

                        const integratorFee =
                            Number(await _swapMain.integratorFee(INTEGRATOR)) / feeDecimals;
                        const platformFee =
                            (integratorFee * Number(await _swapMain.platformShare(INTEGRATOR))) /
                            feeDecimals;

                        await expect(Number(integratorCollectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * (Number(integratorFee) - platformFee)
                        );
                        // take platform comission in transit token
                        await expect(Number(collectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * Number(platformFee)
                        );

                        await expect(Number(tokenBalanceAfter)).to.be.eq(
                            Number(integratorFee) * Number(tokenBalanceBefore)
                        );
                    });

                    it('should successfully swapV2 token to native with rubic & integrator fee', async () => {
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

                        let tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            path: [transitToken.address, wnative.address],
                            amountOutMinimum: ethers.BigNumber.from('20000000000000000') // 0.02 eth for 1000$ is minOut
                        });

                        await expect(
                            _swapMain.executeMessageWithTransfer(
                                ethers.constants.AddressZero,
                                transitToken.address,
                                ethers.BigNumber.from('1000000000'),
                                DST_CHAIN_ID,
                                message,
                                EXECUTOR_ADDRESS
                            )
                        ).to.emit(swapMain, 'SwapRequestDone');

                        const tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);
                        const collectedFee1 = await swapMain.collectedFee(transitToken.address);
                        const integratorCollectedFee1 = await swapMain.integratorCollectedFee(
                            INTEGRATOR,
                            transitToken.address
                        );

                        const integratorFee =
                            Number(await _swapMain.integratorFee(INTEGRATOR)) / feeDecimals;
                        const platformFee =
                            (integratorFee * Number(await _swapMain.platformShare(INTEGRATOR))) /
                            feeDecimals;

                        await expect(Number(integratorCollectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * (Number(integratorFee) - platformFee)
                        );
                        // take platform comission in transit token
                        await expect(Number(collectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * Number(platformFee)
                        );

                        await expect(Number(tokenBalanceAfter)).to.be.eq(
                            Number(integratorFee) * Number(tokenBalanceBefore)
                        );
                    });

                    it('should fail swap V2 with rubic & integrator fee', async () => {
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

                        let tokenBalanceBefore = await transitToken.balanceOf(swapMain.address);

                        message = await getMessage(testMessagesContract, nonce, DST_CHAIN_ID, {
                            path: [transitToken.address, swapToken.address],
                            amountOutMinimum: ethers.BigNumber.from('20000000000000000000') // 20 eth for 1000$ is min out
                        });
                        await expect(
                            _swapMain.executeMessageWithTransfer(
                                ethers.constants.AddressZero,
                                transitToken.address,
                                ethers.BigNumber.from('1000000000'),
                                DST_CHAIN_ID,
                                message,
                                EXECUTOR_ADDRESS
                            )
                        ).to.emit(swapMain, 'SwapRequestDone');
                        const tokenBalanceAfter = await transitToken.balanceOf(swapMain.address);
                        const collectedFee1 = await swapMain.collectedFee(transitToken.address);
                        const integratorCollectedFee1 = await swapMain.integratorCollectedFee(
                            INTEGRATOR,
                            transitToken.address
                        );

                        const integratorFee =
                            Number(await _swapMain.integratorFee(INTEGRATOR)) / feeDecimals;
                        const platformFee =
                            (integratorFee * Number(await _swapMain.platformShare(INTEGRATOR))) /
                            feeDecimals;

                        await expect(Number(integratorCollectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * (Number(integratorFee) - platformFee)
                        );
                        // take platform comission in transit token
                        await expect(Number(collectedFee1)).to.be.eq(
                            Number(tokenBalanceBefore) * Number(platformFee)
                        );

                        await expect(Number(tokenBalanceAfter)).to.be.eq(
                            Number(integratorFee) * Number(tokenBalanceBefore)
                        );
                    });
                });
            });
        });
    });
});
