import { $ } from 'bun'; // Shell execution via JS

let env: any = {};
let api: any = {};

env = await $`doppler secrets -p frtnd -c prd_marquelmedia download --no-file --format json`.json();

Bun.write(`.env.marquelmedia`, JSON.stringify(env));

// Apply Environment Vars
await $`echo "Applying Environment Vars"`;

api = JSON.parse(await Bun.file('./js/bcknd.spec.json').text());
api.api.v1.version = env.MM_VERSION;
await Bun.write('./js/bcknd.spec.json', JSON.stringify(api));

await $`echo "Done!\n"`;
