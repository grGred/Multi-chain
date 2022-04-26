import { RubicRouterV2 } from '../../../typechain-types';
import { ethers, network } from 'hardhat';
import { Wallet } from '@ethersproject/wallet';


async function main() {
    let wallet: Wallet;
    const RubicRouterV2Factory = await ethers.getContractFactory('RubicRouterV2');

    const proxyAddress = "0x6Ba34Bd6fd373Ac174B636d43d5A5208901257e0";

    let router = RubicRouterV2Factory.attach(proxyAddress) as RubicRouterV2;
    [wallet] = await (ethers as any).getSigners();
    router = router.connect(wallet);

    await router.initialize('0xFF4E183a0Ceb4Fa98E63BbF8077B929c8E5A2bA4',
        ['0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506'],
        '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83');
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });