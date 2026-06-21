"use client";

// Client-only providers: react-query for caching + dapp-kit for wallet & SuiClient.
// Wraps the whole app via layout.tsx.

import "@mysten/dapp-kit/dist/index.css";
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
} from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

const { networkConfig } = createNetworkConfig({
  testnet: {
    url: getJsonRpcFullnodeUrl("testnet"),
    network: "testnet",
  },
  mainnet: {
    url: getJsonRpcFullnodeUrl("mainnet"),
    network: "mainnet",
  },
});

export function Providers({ children }: { children: ReactNode }) {
  // QueryClient must be created lazily inside the component so each user gets
  // their own (no cross-request sharing under SSR).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>{children}</WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
