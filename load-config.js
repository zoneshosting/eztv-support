import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configName = process.env.INSTANCE_CONFIG || 'birdseye';
const sourcePath = path.join(__dirname, 'configs', `${configName}.json`);
const destPath = path.join(__dirname, 'config.json');
const kbDir = path.join(__dirname, 'knowledge-base');

if (!fs.existsSync(sourcePath)) {
    console.error(`Config file not found: ${sourcePath}`);
    process.exit(1);
}

// Read base config
const config = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// Scan knowledge-base directory
if (fs.existsSync(kbDir)) {
    const categories = fs.readdirSync(kbDir).filter(f => fs.statSync(path.join(kbDir, f)).isDirectory());
    const knowledgeBase = categories.map(category => {
        const categoryPath = path.join(kbDir, category);
        const articles = fs.readdirSync(categoryPath)
            .filter(f => f.endsWith('.md'))
            .map(file => {
                const content = fs.readFileSync(path.join(categoryPath, file), 'utf8');
                return {
                    title: path.basename(file, '.md'),
                    content: content.trim()
                };
            });
        return { category, articles };
    });

    // Override or merge KB data
    config.knowledgeBase = knowledgeBase;
}

fs.writeFileSync(destPath, JSON.stringify(config, null, 2));
console.log(`Successfully loaded config and scanned knowledge-base for: ${configName}`);
