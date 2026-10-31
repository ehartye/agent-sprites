export interface SoftwareIntegrity {readonly bytes:number;readonly sha256:string;}
export interface SoftwareManifest {
  readonly format:'agent-sprites/ui-software@1';readonly version:1;
  readonly producer:{readonly name:'agent-sprites';readonly version:string;readonly identity:{readonly algorithm:'sha256-ui-software-v1';readonly sha256:string}};
  readonly files:Readonly<Record<string,SoftwareIntegrity>>;
}
export const UI_SOFTWARE_FILES:readonly string[];
/** Emits software only. Never imports art builders/native dependencies or changes art provenance. Refuses unowned collisions or modified previous bundle files. */
export function publishUiSoftware(options:{readonly output:string}):{readonly manifest:string;readonly artifacts:Readonly<Record<string,string>>;readonly receipt:SoftwareManifest};

/** Like publishUiSoftware but refuses any directory already holding a name this bundle owns. */
export function exportUiSoftware(options:{readonly output:string}):{readonly manifest:string;readonly artifacts:Readonly<Record<string,string>>;readonly receipt:SoftwareManifest};
/** Read-only: compares content digests of the rebuilt bundle (files plus manifest) with a directory. Writes nothing. */
export function verifyUiSoftware(options:{readonly output:string}):{readonly ok:boolean;readonly checked:number;readonly missing:readonly string[];readonly differing:readonly string[]};
