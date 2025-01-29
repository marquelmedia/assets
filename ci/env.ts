import { $ } from 'bun'; // Shell execution via JS

let bcknd: any = {};
let api: any = {};

bcknd = await $`doppler secrets -p bcknd -c prd_marquelmedia download --no-file --format json`.json();

//Bun.write(`.env.marquelmedia`, JSON.stringify(env));

// Apply Environment Vars
await $`echo "Applying Environment Vars"`;

api = JSON.parse(await Bun.file('./js/bcknd.spec.json').text());
api.api.v1.version = bcknd.APP_VERSION;

await Bun.write('./js/bcknd.spec.json', JSON.stringify(api, null, 2));
await $`echo "Done!\n"`;
