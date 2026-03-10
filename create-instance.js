import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function run() {
    console.log('--- Support Instance Creator ---');

    const name = await new Promise(resolve => rl.question('Enter Company Name (e.g. CableBusters): ', resolve));
    const id = name.toLowerCase().replace(/\s+/g, '_');
    const repoName = `${id}-support`;

    console.log(`\nCreating instance for: ${name} (ID: ${id})`);

    // 1. Create Config (Template from BirdsEye)
    const templatePath = path.join(__dirname, 'configs', 'birdseye.json');
    let config;

    if (fs.existsSync(templatePath)) {
        const templateContent = fs.readFileSync(templatePath, 'utf8');
        // Replace all "BirdsEye" with the new name in the whole config (especially the prompt)
        const replacedContent = templateContent.replace(/BirdsEye/g, name);
        config = JSON.parse(replacedContent);

        // Update specific fields
        config.company.name = name;
        config.company.supportEmail = `support@${id.replace('_', '')}.com`;
    } else {
        config = {
            company: {
                name: name,
                supportNumber: "TBD",
                supportEmail: `support@${id.replace('_', '')}.com`,
                logoUrl: "/logo.png",
                theme: { primaryColor: "zinc-900", accentColor: "emerald-500" }
            },
            telegram: { botToken: "TBD", chatId: "TBD" },
            prompt: {
                identity: `# ${name} Tech Support Voice Agent Prompt\n\nYou are ${name} Support Assistant...`,
                knowledgeBase: []
            }
        };
    }

    const configPath = path.join(__dirname, 'configs', `${id}.json`);
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log(`✅ Created config: configs/${id}.json`);

    // 2. Prepare Knowledge Base
    const kbDir = path.join(__dirname, 'knowledge-base', 'General');
    if (!fs.existsSync(kbDir)) fs.mkdirSync(kbDir, { recursive: true });

    const welcomePath = path.join(kbDir, 'Welcome.md');
    if (!fs.existsSync(welcomePath)) {
        fs.writeFileSync(welcomePath, `# Welcome to ${name} Support\n\nThis is your automated support portal.`);
        console.log(`✅ Created initial KB article: knowledge-base/General/Welcome.md`);
    }

    // 3. GitHub Automation (Optional - user needs gh CLI)
    console.log(`\n--- GitHub Repo Creation ---`);
    const createRepo = await new Promise(resolve => rl.question('Do you want to create a new GitHub repo for this? (y/n): ', resolve));

    if (createRepo.toLowerCase() === 'y') {
        let currentRepoName = repoName;
        let success = false;

        while (!success) {
            try {
                console.log('Checking gh CLI...');
                execSync('gh --version', { stdio: 'ignore' });

                console.log(`Checking if repository ${currentRepoName} already exists...`);
                try {
                    // This will throw if the repo DOES NOT exist (which is what we want)
                    execSync(`gh repo view ${currentRepoName}`, { stdio: 'ignore' });
                    console.log(`⚠️ Repo '${currentRepoName}' already exists.`);
                    currentRepoName = await new Promise(resolve => rl.question('Enter a DIFFERENT Repo Name (or hit Enter to try suffixing): ', resolve));
                    if (!currentRepoName) currentRepoName = `${repoName}_${Math.floor(Math.random() * 1000)}`;
                    continue;
                } catch (viewErr) {
                    // Repo doesn't exist, proceed
                }

                console.log(`Creating repository: ${currentRepoName}...`);

                // Remove existing origin if it exists to avoid conflicts
                try { execSync('git remote remove origin', { stdio: 'ignore' }); } catch (e) { }

                execSync(`gh repo create ${currentRepoName} --public --source=. --remote=origin --push`);
                success = true;

                // 4. Post-push Personalization
                console.log('Personalizing repository files...');

                // Update metadata.json
                const metadataPath = path.join(__dirname, 'metadata.json');
                if (fs.existsSync(metadataPath)) {
                    let metadata = fs.readFileSync(metadataPath, 'utf8');
                    metadata = metadata.replace(/BirdsEye/g, name);
                    fs.writeFileSync(metadataPath, metadata);
                }

                // Update README.md
                const readmePath = path.join(__dirname, 'README.md');
                if (fs.existsSync(readmePath)) {
                    let readme = fs.readFileSync(readmePath, 'utf8');
                    readme = readme.replace(/BirdsEye/g, name);
                    readme = readme.replace(/birdseye-support/g, currentRepoName);
                    fs.writeFileSync(readmePath, readme);
                }

                // Update package.json
                const pkgPath = path.join(__dirname, 'package.json');
                const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                pkg.name = currentRepoName;
                fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

                // Update index.html title
                const htmlPath = path.join(__dirname, 'index.html');
                let indexHtml = fs.readFileSync(htmlPath, 'utf8');
                indexHtml = indexHtml.replace(/<title>.*<\/title>/, `<title>${name} Voice Support</title>`);
                fs.writeFileSync(htmlPath, indexHtml);

                // Commit personalization
                try {
                    execSync(`git add .`);
                    execSync(`git commit -m "chore: personalize for ${name}"`);
                    execSync(`git push origin main`);
                } catch (gitErr) {
                    console.warn('⚠️ Could not push personalization commit. You may need to do it manually.');
                }

                console.log(`\n--- Netlify Deployment Automation ---`);
                const deployNetlify = await new Promise(resolve => rl.question('Do you want to create and link a Netlify site for this? (y/n): ', resolve));

                if (deployNetlify.toLowerCase() === 'y') {
                    try {
                        console.log('Checking Netlify CLI...');
                        execSync('netlify --version', { stdio: 'ignore' });

                        console.log(`Creating Netlify site: ${currentRepoName}...`);
                        execSync(`netlify sites:create --name ${currentRepoName} --account zoneshosting`, { stdio: 'inherit' });

                        console.log('Linking repository for Continuous Deployment...');
                        execSync(`netlify link --name ${currentRepoName}`, { stdio: 'inherit' });

                        console.log('Setting up environment variables in Netlify...');
                        execSync(`netlify env:set INSTANCE_CONFIG ${id}`, { stdio: 'inherit' });

                        console.log(`\n✅ Netlify site created and linked!`);
                        console.log(`View your site at: https://app.netlify.com/sites/${currentRepoName}`);
                    } catch (netErr) {
                        console.error('❌ Error with Netlify automation.');
                        console.error(netErr.message);
                        console.log('Manual Setup: Run "netlify init" to connect this repo to Netlify.');
                    }
                }

                console.log(`\n🚀 GREAT SUCCESS! Repository created, personalized, and pushed: https://github.com/USER/${currentRepoName}`);
                console.log(`\nNext Steps:`);
                console.log(`1. Add files to the 'knowledge-base/' folder.`);
                console.log(`2. Commit and push: git add . && git commit -m "update kb" && git push`);
                console.log(`3. Ensure GEMINI_API_KEY is set in Netlify Environment Variables.`);
            } catch (err) {
                console.error('❌ Error handling repo. Is gh CLI authenticated?');
                console.error(err.message);
                const retry = await new Promise(resolve => rl.question('Try again with a different name? (y/n): ', resolve));
                if (retry.toLowerCase() !== 'y') break;
                currentRepoName = await new Promise(resolve => rl.question('Enter new Repo Name: ', resolve));
            }
        }
    } else {
        console.log('Skipping repo creation. You can manually copy the files.');
    }

    rl.close();
}

run();
