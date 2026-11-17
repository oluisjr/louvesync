import { useSyncExternalStore } from 'react';
import { connectionAvailable, subscribeConnection } from '../lib/connectivity.js';
export function useConnectivity() { return useSyncExternalStore(subscribeConnection, connectionAvailable, () => false); }
