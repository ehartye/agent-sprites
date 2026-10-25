import type {Insets,Rect} from './ui-theme.mjs';
export interface ActionMeasure {readonly id:string;readonly preferredWidth:number;readonly minWidth:number;readonly minHeight:number;readonly fixedHeight?:number;}
export interface ActionGroupInput {readonly actions:readonly ActionMeasure[];readonly visualOrder:readonly string[];readonly fallbackOrder:readonly string[];readonly width:number;readonly insets:Insets;readonly gap:number;readonly rowGap:number;readonly policy:'equal-max-fit'|'authored-width-end';}
export interface ActionGroupPlan {
  readonly format:'agent-sprites/action-group@1';readonly semanticIds:readonly string[];readonly paintIds:readonly string[];readonly width:number;readonly insets:Insets;readonly gap:number;readonly rowGap:number;
  readonly allocation:{readonly kind:'empty'}|{readonly kind:'native-equal';readonly arrangement:'row'|'grid'|'stack';readonly columns:number;readonly rows:readonly (readonly string[])[]}|{readonly kind:'authored';readonly arrangement:'row';readonly slots:readonly (Rect & {readonly id:string})[]};
  readonly occupiedHeight:{readonly known:false;readonly minimum:number}|{readonly known:true;readonly value:number};
  readonly overflow:{readonly known:false;readonly reason:'native-measurement-required';readonly insetDeficit:number}|{readonly known:true;readonly left:number;readonly right:number};
}
export function planActionGroup(input:ActionGroupInput):ActionGroupPlan;
