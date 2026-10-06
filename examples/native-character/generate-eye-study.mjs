import {nativeHeadStudy} from '../../server/authoring/native/native-head-study.mjs';
console.log(JSON.stringify({operations:nativeHeadStudy(process.argv[2]??'peach')}));
