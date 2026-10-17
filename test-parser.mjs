import { parseJenkinsfile } from './src/parser/jenkinsfileParser.js';
import SAMPLE from './src/parser/sampleJenkinsfile.js';

const ast = parseJenkinsfile(SAMPLE);
console.log('=== PARSER DEBUG ===');
console.log('Agent:', JSON.stringify(ast.agent));
console.log('Stages count:', ast.stages?.length);
if (ast.stages?.length > 0) {
  console.log('Stage names:', ast.stages.map(s => s.name));
} else {
  console.log('NO STAGES FOUND - debugging block tree...');
  // Re-run parseBlocks manually to see what's happening
  let code = SAMPLE.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
  
  // Simplified block parser trace
  const root = { header: 'root', body: '', children: [] };
  const stack = [root];
  let currentBlock = root;
  let headerAcc = '';
  let inString = false;
  let stringChar = '';
  let i = 0;
  
  while (i < code.length) {
    const char = code[i];
    if (inString) {
      headerAcc += char;
      if (char === stringChar && i > 0 && code[i - 1] !== '\\') {
        inString = false;
      }
      i++;
      continue;
    }
    if (char === "'" || char === '"') {
      inString = true;
      stringChar = char;
      headerAcc += char;
    } else if (char === '{') {
      const newBlock = { header: headerAcc.trim(), body: '', children: [] };
      currentBlock.children.push(newBlock);
      stack.push(newBlock);
      currentBlock = newBlock;
      headerAcc = '';
    } else if (char === '}') {
      if (headerAcc.trim()) {
        currentBlock.body += headerAcc;
        headerAcc = '';
      }
      stack.pop();
      currentBlock = stack.length > 0 ? stack[stack.length - 1] : root;
    } else if (char === '\n') {
      if (headerAcc.trim()) {
        currentBlock.body += headerAcc + '\n';
      }
      headerAcc = '';
    } else {
      headerAcc += char;
    }
    i++;
  }
  
  // Print the tree
  function printTree(node, indent = 0) {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}[${node.header}] children=${node.children.length} body=${node.body.substring(0, 60).replace(/\n/g, '\\n')}...`);
    for (const child of node.children) {
      printTree(child, indent + 1);
    }
  }
  printTree(root);
}
