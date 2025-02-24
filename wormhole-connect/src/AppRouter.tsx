import React, { useContext, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { makeStyles } from 'tss-react/mui';

import './App.css';
import { RootState } from './store';
import { clearRedeem } from './store/redeem';
import { clearTransfer } from './store/transferInput';
import { isEmptyObject, usePrevious } from './utils';
import { WormholeConnectConfig } from './config/types';
import { setConfig } from './config';
import config from './config';

import Terms from './views/Terms';
import TxSearch from './views/TxSearch';
import { setRoute } from './store/router';
import { clearWallets } from './store/wallet';
import { useExternalSearch } from 'hooks/useExternalSearch';

import BridgeV2 from 'views/v2/Bridge';
import RedeemV2 from 'views/v2/Redeem';
import TxHistory from 'views/v2/TxHistory';
import { RouteContext } from 'contexts/RouteContext';

import {
  AttestedTransferReceipt,
  TransferState,
} from '@wormhole-foundation/sdk';
import { parseReceipt } from 'utils/sdkv2';
import {
  setIsResumeTx,
  setTxDetails,
  setRoute as setRedeemRoute,
} from './store/redeem';
import { getWormholeContextV2 } from './config';
import { setToChain } from './store/transferInput';

const useStyles = makeStyles()((theme: any) => ({
  appContent: {
    textAlign: 'left',
    margin: '40px auto',
    maxWidth: '900px',
    width: '100%',
    display: 'flex',
    justifyContent: 'center',
    padding: '4px',
    fontFamily: theme.palette.font.primary,
    [theme.breakpoints.down('sm')]: {
      margin: '0 auto',
    },
  },
}));

interface Props {
  config?: WormholeConnectConfig;
}

// since this will be embedded, we'll have to use pseudo routes instead of relying on the url
function AppRouter(props: Props) {
  const { classes } = useStyles();
  const dispatch = useDispatch();
  const routeContext = useContext(RouteContext);

  // We update the global config once when WormholeConnect is first mounted, if a custom
  // config was provided.
  //
  // We don't allow config changes afterwards because they could lead to lots of
  // broken and undesired behavior.
  React.useEffect(() => {
    if (!isEmptyObject(props.config)) {
      setConfig(props.config);
      dispatch(clearTransfer());
    }

    config.triggerEvent({
      type: 'load',
      config: props.config,
    });
  }, []);

  const route = useSelector((state: RootState) => state.router.route);
  const prevRoute = usePrevious(route);
  const { hasExternalSearch } = useExternalSearch();
  useEffect(() => {
    const redeemRoute = 'redeem';
    const bridgeRoute = 'bridge';
    // reset redeem state on leave
    if (prevRoute === redeemRoute && route !== redeemRoute) {
      dispatch(clearRedeem());
      dispatch(clearWallets());
      routeContext.clear();
      config.whLegacy.registerProviders(); // reset providers that may have been set during transfer
    }
    // reset transfer state on leave
    const isEnteringBridge = route === bridgeRoute && prevRoute !== bridgeRoute;
    if (isEnteringBridge && prevRoute !== 'history') {
      dispatch(clearTransfer());
    }
  }, [route, prevRoute, dispatch]);

  useEffect(() => {
    if (hasExternalSearch) {
      dispatch(clearRedeem());
      dispatch(setRoute('search'));
    }
  }, [hasExternalSearch, dispatch]);

  // Handle initial route setup
  useEffect(() => {
    const setupInitialRoute = async () => {
      if (props.config?.ui?.onlyResume) {
        try {
          const resumeResult = await config.routes.resumeFromTx({
            chain: props.config?.ui?.onlyResume.chainName,
            txid: props.config?.ui?.onlyResume.txHash,
          });

          if (resumeResult === null) {
            console.error('Transfer not found');
            return;
          }

          const { route } = resumeResult;
          let { receipt } = resumeResult;
          const wh = await getWormholeContextV2();
          const sdkRoute = new (config.routes.get(route).rc)(wh);

          if (receipt.state < TransferState.Attested) {
            for await (receipt of sdkRoute.track(receipt)) {
              if (receipt.state >= TransferState.Attested) {
                break;
              }
            }
          }

          // Set up redeem state
          const txDetails = await parseReceipt(
            route,
            receipt as AttestedTransferReceipt<any>,
          );
          if (txDetails) {
            dispatch(setTxDetails(txDetails));
            dispatch(setIsResumeTx(true));
            dispatch(setRedeemRoute(route));
            dispatch(setRoute('redeem'));
            dispatch(setToChain(receipt.to));
          }

          // Set up route context
          routeContext.setRoute(sdkRoute);
          routeContext.setReceipt(receipt);
        } catch (e) {
          console.error('Error setting up initial redeem route:', e);
        }
      }
    };

    setupInitialRoute();
  }, []);

  if (props.config?.ui?.onlyResume) {
    if (route === 'redeem') {
      return (
        <div className={classes.appContent}>
          <RedeemV2 />
        </div>
      );
    } else {
      return props.config?.ui?.onlyResume?.customLoading();
    }
  }

  return (
    <div className={classes.appContent}>
      {route === 'bridge' && <BridgeV2 />}
      {route === 'redeem' && <RedeemV2 />}
      {route === 'search' && <TxSearch />}
      {route === 'history' && <TxHistory />}
      {route === 'terms' && <Terms />}
    </div>
  );
}

export default AppRouter;
