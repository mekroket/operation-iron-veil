/** The complete builder table. Typed as a Record, so a kind missing from the catalog fails to compile. */
import type { PropKind } from '../../propCatalog';
import {
  barrelBuilder,
  cableSpoolBuilder,
  crateBuilder,
  crateLargeBuilder,
  palletBuilder,
  palletStackBuilder,
  pipeBundleBuilder,
  sandbagsBuilder,
  tyreStackBuilder,
} from './cargo';
import { containerBuilder } from './containers';
import { craneGantryBuilder } from './crane';
import { dataTerminalBuilder, deskBuilder, generatorBuilder, serverRackBuilder, shelfRackBuilder } from './interior';
import type { PropBuilder } from './propTypes';
import {
  bollardBuilder,
  boomGateBuilder,
  fencePanelBuilder,
  guardBoothBuilder,
  jerseyBarrierBuilder,
  lampPostBuilder,
  mooringCleatBuilder,
  warningSignBuilder,
} from './street';
import { forkliftBuilder, rhibBuilder, truckBuilder } from './vehicles';

export const PROP_BUILDERS: Record<PropKind, PropBuilder> = {
  container: containerBuilder(12.19),
  containerShort: containerBuilder(6.06),
  crate: crateBuilder,
  crateLarge: crateLargeBuilder,
  barrel: barrelBuilder,
  pallet: palletBuilder,
  palletStack: palletStackBuilder,
  sandbags: sandbagsBuilder,
  jerseyBarrier: jerseyBarrierBuilder,
  boomGate: boomGateBuilder,
  guardBooth: guardBoothBuilder,
  lampPost: lampPostBuilder,
  forklift: forkliftBuilder,
  bollard: bollardBuilder,
  fencePanel: fencePanelBuilder,
  shelfRack: shelfRackBuilder,
  desk: deskBuilder,
  serverRack: serverRackBuilder,
  craneGantry: craneGantryBuilder,
  rhib: rhibBuilder,
  pipeBundle: pipeBundleBuilder,
  cableSpool: cableSpoolBuilder,
  tyreStack: tyreStackBuilder,
  warningSign: warningSignBuilder,
  generator: generatorBuilder,
  dataTerminal: dataTerminalBuilder,
  mooringCleat: mooringCleatBuilder,
  truck: truckBuilder,
};
