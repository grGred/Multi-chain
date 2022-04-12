import { ethers } from 'hardhat';

export const DEADLINE = '9999999999999999';
export const DST_CHAIN_ID = 5;
export const VERSION = 1;
export const DEFAULT_AMOUNT_IN = ethers.utils.parseEther('1');
export const DEFAULT_AMOUNT_OUT_MIN = ethers.utils.parseEther('1');
export const MAX_RUBIC_SWAP = '1000' + '0'.repeat(6);
