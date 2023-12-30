import { StructFieldName, StructFieldNameNested, TT as l3TT } from "@ndn/packet";
import { Decoder, EvDecoder, StructBuilder, StructFieldEnum, StructFieldNNI, type StructFields, StructFieldText } from "@ndn/tlv";

import { CsFlags, FaceFlags, FacePersistency, RouteFlags, TT } from "./an-nfd";
import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import { type ControlResponse } from "./control-response";

const flagBits = { ...FaceFlags, ...CsFlags, ...RouteFlags };

const buildControlParameters = new StructBuilder("ControlParameters", 0x68)
  .add(l3TT.Name, "name", StructFieldName)
  .add(TT.FaceId, "faceId", StructFieldNNI)
  .add(TT.Uri, "uri", StructFieldText)
  .add(TT.LocalUri, "localUri", StructFieldText)
  .add(TT.Origin, "origin", StructFieldNNI)
  .add(TT.Cost, "cost", StructFieldNNI)
  .add(TT.Capacity, "capacity", StructFieldNNI)
  .add(TT.Count, "count", StructFieldNNI)
  .add(TT.BaseCongestionMarkingInterval, "baseCongestionMarkingInterval", StructFieldNNI)
  .add(TT.DefaultCongestionThreshold, "defaultCongestionThreshold", StructFieldNNI)
  .add(TT.Mtu, "mtu", StructFieldNNI)
  .add(TT.Flags, "flags", StructFieldNNI, { flagPrefix: "flag", flagBits: flagBits })
  .add(TT.Mask, "mask", StructFieldNNI, { flagBits: flagBits })
  .add(TT.Strategy, "strategy", StructFieldNameNested)
  .add(TT.ExpirationPeriod, "expirationPeriod", StructFieldNNI)
  .add(TT.FacePersistency, "facePersistency", StructFieldEnum<FacePersistency>(FacePersistency))
  .setIsCritical(EvDecoder.neverCritical);
/** NFD Management ControlParameters struct. */
export class ControlParameters extends buildControlParameters.baseClass<ControlParameters>() {
  /**
   * Decode from ControlResponse body.
   * @param response ControlResponse that contains ControlParameters.
   */
  public static decodeFromResponseBody(response: { body: Uint8Array }): ControlParameters {
    return Decoder.decode(response.body, ControlParameters);
  }

  constructor(value: ControlParameters.Fields = {}) {
    super();
    Object.assign(this, value);
  }
}
buildControlParameters.subclass = ControlParameters;

export namespace ControlParameters {
  export type Fields = Partial<StructFields<typeof buildControlParameters>>;
}

/**
 * Pick fields from ControlParameters.Fields.
 * R are required.
 * O are optional.
 */
type CP<R extends keyof ControlParameters.Fields, O extends keyof ControlParameters.Fields> =
  Required<Pick<ControlParameters.Fields, R>> & Pick<ControlParameters.Fields, O>;

/** Declare required and optional fields of each command. */
interface Commands {
  "faces/create": CP<"uri", "localUri" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "mtu" | "flags" | `flag${keyof typeof FaceFlags}` | "mask">;
  "faces/update": CP<never, "faceId" | "facePersistency" | "baseCongestionMarkingInterval" |
  "defaultCongestionThreshold" | "flags" | `flag${keyof typeof FaceFlags}` | "mask">;
  "faces/destroy": CP<"faceId", never>;
  "strategy-choice/set": CP<"name" | "strategy", never>;
  "strategy-choice/unset": CP<"name", never>;
  "rib/register": CP<"name", "faceId" | "origin" | "cost" | "flags" |
  `flag${keyof typeof RouteFlags}` | "expirationPeriod">;
  "rib/unregister": CP<"name", "faceId" | "origin">;
}

/**
 * Invoke NFD ControlCommand and wait for response.
 * @param command command module and verb.
 * @param params command parameters.
 * @param opts other options.
 * @returns command response.
 */
export async function invoke<C extends keyof Commands>(command: C, params: Commands[C], opts: ControlCommandOptions = {}): Promise<ControlResponse> {
  return invokeGeneric(command, new ControlParameters(params), opts);
}
