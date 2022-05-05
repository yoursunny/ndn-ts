import type { FwFace } from "@ndn/fw";
import { splitHostPort, TcpTransport, udp_helper, UdpTransport } from "@ndn/node-transport";
import defaultGateway from "default-gateway";
import * as os from "node:os";
import nodeFetch from "node-fetch";

import type { PlatformFchDefaults } from "./fch";
import type { ConnectRouterOptions } from "./router";

export function fetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  return nodeFetch(input as any, init as any) as any;
}

function hasAddressFamily(want: udp_helper.AddressFamily): boolean {
  return Object.values(os.networkInterfaces()).some(
    (addrs) => addrs?.some((addr) => udp_helper.intfHasAddressFamily(want, addr)));
}

export const FCH_DEFAULTS: PlatformFchDefaults = {
  transports() { return ["udp"]; },
  get hasIPv4() { return hasAddressFamily(4); },
  get hasIPv6() { return hasAddressFamily(6); },
};

export async function getDefaultGateway(): Promise<string> {
  const result = await defaultGateway.v4();
  return result.gateway;
}

export function createFace(router: string, {
  fw,
  preferTcp = false,
  mtu,
  connectTimeout,
  addRoutes,
}: ConnectRouterOptions): Promise<FwFace> {
  const { host, port } = splitHostPort(router);
  if (preferTcp) {
    return TcpTransport.createFace({ fw, addRoutes }, { host, port, connectTimeout });
  }
  return UdpTransport.createFace({ fw, addRoutes, lp: { mtu } }, { host, port });
}
