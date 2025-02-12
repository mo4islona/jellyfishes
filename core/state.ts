import { PortalClient } from '@subsquid/portal-client';
import { Offset } from './abstract_stream';

export interface State<Args extends any[] = any[]> {
  saveOffset(offset: Offset, ...args: Args): Promise<unknown>;

  getOffset(v: Offset): Promise<{ current: Offset; initial: Offset } | undefined>;

  setPortal(portal: PortalClient): void;
}

export abstract class AbstractState {
  portal: PortalClient;

  setPortal(portal: PortalClient) {
    this.portal = portal;
  }
}
