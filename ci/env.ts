import { $ } from 'bun'; // Shell execution via JS

let env: any = {};

env = await $`doppler secrets -p frtnd -c prd_marquelmedia download --no-file --format json`.json();

Bun.write(`.env.marquelmedia`, JSON.stringify(env));

// Apply Environment Vars
await $`echo "Applying Environment Vars"`;
for await (let file of $`grep -Rl 'APP\\|THEME\\|CLIENT\\|TENANT\\|MKTG\\|MM' ./`.lines()) {
  if (file) {
    let content = await Bun.file(file).text();
    Object.keys(env).forEach(async (secret) => {
      content = content.replace(new RegExp(secret, 'g'), env[secret]);
    });
    await Bun.write(file, content);
  }
}

await $`echo "Done!\n"`;
