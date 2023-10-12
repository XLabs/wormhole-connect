import {
  WormholeContext,
  MainnetChainName,
  TestnetChainName,
} from '@wormhole-foundation/wormhole-connect-sdk';
import MAINNET from './mainnet';
import TESTNET from './testnet';
import DEVNET from './devnet';
import {
  TokenConfig,
  ChainConfig,
  WormholeConnectConfig,
  Route,
} from './types';
import { dark, light } from 'theme';
import { validateConfigs, validateDefaults } from './utils';

const el = document.getElementById('wormhole-connect');
if (!el)
  throw new Error('must specify an anchor element with id wormhole-connect');
const configJson = el.getAttribute('config');
export const config: WormholeConnectConfig = JSON.parse(configJson!) || {
  moreTokens: {
    href: 'https://portalbridge.com?sourceChain={:sourceChain}&targetChain={:targetChain}',
    label: 'More tokens ...',
  },
  extraNetworks: {
    href: 'https://portalbridge.com?sourceChain={:sourceChain}&targetChain={:targetChain}',
    networks: [
      {
        name: 'algorand',
        icon: "data:image/svg+xml,%3C%3Fxml version='1.0' encoding='utf-8'%3F%3E%3Csvg viewBox='532.3494 45.7309 238.36 238.72' width='238.36' height='238.72' xmlns='http://www.w3.org/2000/svg'%3E%3Cg id='lINT7W' transform='matrix(1, 0, 0, 1, 326.5293884277344, -159.9090576171875)'%3E%3Cpolygon class='cls-1' points='444.18 444.32 406.81 444.32 382.54 354.04 330.36 444.33 288.64 444.33 369.29 304.57 356.31 256.05 247.56 444.36 205.82 444.36 343.64 205.64 380.18 205.64 396.18 264.95 433.88 264.95 408.14 309.71 444.18 444.32' style='fill: rgb(255, 255, 255);'/%3E%3C/g%3E%3C/svg%3E",
        label: 'Algorand',
      },
      {
        icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' class='MuiSvgIcon-root MuiSvgIcon-fontSizeMedium MuiBox-root css-uqopch' focusable='false' aria-hidden='true' viewBox='0 0 24 24' data-testid='OpenInNewIcon'%3E%3Cpath d='M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z' fill='%23ffffff'%3E%3C/path%3E%3C/svg%3E",
        label: 'More ...',
        href: 'https://portalbridge.com/#/transfer',
        showOpenInNewIcon: false,
      },
    ],
  },
};

const getEnv = () => {
  const processEnv = process.env.REACT_APP_CONNECT_ENV?.toLowerCase();
  if (config.env === 'mainnet' || processEnv === 'mainnet') return 'MAINNET';
  if (config.env === 'devnet' || processEnv === 'devnet') return 'DEVNET';
  return 'TESTNET';
};

export const ENV = getEnv();
export const isMainnet = ENV === 'MAINNET';
export const sdkConfig = WormholeContext.getConfig(ENV);
export const pageHeader =
  config.pageHeader === undefined ? '' : config.pageHeader;

export const WORMSCAN = 'https://wormholescan.io/#/';
export const WORMHOLE_API =
  ENV === 'MAINNET'
    ? 'https://api.wormholescan.io/'
    : ENV === 'DEVNET'
    ? ''
    : 'https://api.testnet.wormholescan.io/';

export const ATTEST_URL =
  ENV === 'MAINNET'
    ? 'https://www.portalbridge.com/#/register'
    : ENV === 'DEVNET'
    ? ''
    : 'https://wormhole-foundation.github.io/example-token-bridge-ui/#/register';

export const WORMHOLE_RPC_HOSTS =
  ENV === 'MAINNET'
    ? [
        'https://wormhole-v2-mainnet-api.certus.one',
        'https://wormhole.inotel.ro',
        'https://wormhole-v2-mainnet-api.mcf.rocks',
        'https://wormhole-v2-mainnet-api.chainlayer.network',
        'https://wormhole-v2-mainnet-api.staking.fund',
        'https://wormhole-v2-mainnet.01node.com',
      ]
    : ENV === 'TESTNET'
    ? ['https://wormhole-v2-testnet-api.certus.one']
    : ['http://localhost:7071'];

export const NETWORK_DATA =
  ENV === 'MAINNET' ? MAINNET : ENV === 'DEVNET' ? DEVNET : TESTNET;

export const CHAINS = NETWORK_DATA.chains;
export const CHAINS_ARR =
  config && config.networks
    ? Object.values(CHAINS).filter((c) => config.networks!.includes(c.key))
    : (Object.values(CHAINS) as ChainConfig[]);

export const EXTRA_NETWOKS = config && config.extraNetworks;
export const MORE_TOKENS = config && config.moreTokens;
export const TOKENS = NETWORK_DATA.tokens;
export const TOKENS_ARR =
  config && config.tokens
    ? Object.values(TOKENS).filter((c) => config.tokens!.includes(c.key))
    : (Object.values(TOKENS) as TokenConfig[]);

export const ROUTES =
  config && config.routes ? config.routes : Object.values(Route);

export const RPCS =
  config && config.rpcs
    ? Object.assign({}, sdkConfig.rpcs, NETWORK_DATA.rpcs, config.rpcs)
    : Object.assign({}, sdkConfig.rpcs, NETWORK_DATA.rpcs);

export const REST =
  config && config.rest
    ? Object.assign({}, NETWORK_DATA.rest, config.rest)
    : NETWORK_DATA.rest;

export const GAS_ESTIMATES = NETWORK_DATA.gasEstimates;

export const THEME_MODE = config && config.mode ? config.mode : 'dark';
export const CUSTOM_THEME = config && config.customTheme;
const BASE_THEME = THEME_MODE === 'dark' ? dark : light;
export const THEME = CUSTOM_THEME
  ? Object.assign({}, BASE_THEME, CUSTOM_THEME)
  : BASE_THEME;

export const CTA = config && config.cta;
export const BRIDGE_DEFAULTS =
  config && validateDefaults(config.bridgeDefaults);

export const TESTNET_TO_MAINNET_CHAIN_NAMES: {
  [k in TestnetChainName]: MainnetChainName;
} = {
  goerli: 'ethereum',
  fuji: 'avalanche',
  mumbai: 'polygon',
  alfajores: 'celo',
  moonbasealpha: 'moonbeam',
  solana: 'solana',
  bsc: 'bsc',
  fantom: 'fantom',
  sui: 'sui',
  aptos: 'aptos',
  arbitrumgoerli: 'arbitrum',
  optimismgoerli: 'optimism',
  basegoerli: 'base',
  sei: 'sei',
  wormchain: 'wormchain',
  osmosis: 'osmosis',
};

validateConfigs();
