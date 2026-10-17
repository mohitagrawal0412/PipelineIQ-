/**
 * Jenkinsfile Declarative Pipeline Parser
 * Parses Jenkinsfile source into a structured JSON AST.
 *
 * Handles: pipeline, agent, options, triggers, parameters, environment,
 * stages, parallel, when (branch/expression), steps, post blocks.
 */

function extractStringLiteral(str) {
  const s = str.trim();
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Strip comments while respecting strings.
 * Handles // line comments and /* block comments *​/ but NOT inside quotes.
 */
function stripComments(source) {
  let result = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  while (i < source.length) {
    // Inside single-quoted string
    if (inSingleQuote) {
      result += source[i];
      if (source[i] === "'" && source[i - 1] !== '\\') {
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    // Inside double-quoted string
    if (inDoubleQuote) {
      result += source[i];
      if (source[i] === '"' && source[i - 1] !== '\\') {
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    // Check for block comment start /*
    if (source[i] === '/' && source[i + 1] === '*') {
      // Skip until */
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
      continue;
    }

    // Check for line comment //
    if (source[i] === '/' && source[i + 1] === '/') {
      // Skip until end of line
      while (i < source.length && source[i] !== '\n') {
        i++;
      }
      continue;
    }

    // Check for string starts
    if (source[i] === "'") {
      inSingleQuote = true;
      result += source[i];
      i++;
      continue;
    }
    if (source[i] === '"') {
      inDoubleQuote = true;
      result += source[i];
      i++;
      continue;
    }

    result += source[i];
    i++;
  }

  return result;
}

/**
 * Block-level tokenizer: splits source into a tree of { header, body, children, raw }.
 * - `header`: the text before the opening `{` (e.g., "stage('Build')")
 * - `body`: lines of text inside the block that are NOT sub-blocks
 * - `children`: nested blocks
 * - `raw`: the original source substring for this block
 *
 * Braces inside quoted strings are ignored (not treated as block delimiters).
 */
function parseBlocks(source) {
  const root = { header: 'root', body: '', children: [], raw: source };
  const stack = [root];
  let currentBlock = root;

  let i = 0;
  let headerAcc = '';
  let inString = false;
  let stringChar = '';

  while (i < source.length) {
    const char = source[i];

    // --- Inside a quoted string: accumulate into headerAcc and wait for close ---
    if (inString) {
      headerAcc += char;
      if (char === stringChar && i > 0 && source[i - 1] !== '\\') {
        inString = false;
      }
      i++;
      continue;
    }

    // --- Not in a string ---
    if (char === "'" || char === '"') {
      // Enter string mode — keep accumulating into headerAcc
      inString = true;
      stringChar = char;
      headerAcc += char;
    } else if (char === '{') {
      // Open a new block: headerAcc becomes its header
      const newBlock = { header: headerAcc.trim(), body: '', children: [], raw: '' };
      currentBlock.children.push(newBlock);
      stack.push(newBlock);
      currentBlock = newBlock;
      headerAcc = '';
    } else if (char === '}') {
      // Flush any trailing text
      if (headerAcc.trim()) {
        currentBlock.body += headerAcc;
        headerAcc = '';
      }
      // Reconstruct raw source for this block
      currentBlock.raw = currentBlock.header + ' {\n' + currentBlock.body + '\n}';
      // Pop stack
      stack.pop();
      currentBlock = stack.length > 0 ? stack[stack.length - 1] : root;
    } else if (char === '\n') {
      // End of line: flush headerAcc into body
      if (headerAcc.trim()) {
        currentBlock.body += headerAcc + '\n';
      } else {
        currentBlock.body += '\n';
      }
      headerAcc = '';
    } else {
      headerAcc += char;
    }

    i++;
  }

  // Flush any remaining text
  if (headerAcc.trim()) {
    currentBlock.body += headerAcc;
  }
  return root;
}


// ======================== TOP-LEVEL PARSER ========================

export function parseJenkinsfile(source) {
  const ast = {
    agent: null,
    options: [],
    triggers: [],
    parameters: [],
    environment: {},
    stages: [],
    post: null,
  };

  try {
    // Strip comments using string-aware comment removal
    const code = stripComments(source);

    const root = parseBlocks(code);

    // Find the `pipeline` block
    const pipelineBlock = root.children.find((c) => c.header === 'pipeline');
    if (pipelineBlock) {
      processPipeline(pipelineBlock, ast);
    }
  } catch (e) {
    console.warn('Parser encountered an error, returning partial AST:', e);
  }

  return ast;
}

function processPipeline(block, ast) {
  for (const child of block.children) {
    const h = child.header;
    if (h.startsWith('agent')) {
      ast.agent = parseAgent(child);
    } else if (h.startsWith('options')) {
      ast.options = parseOptionsList(child);
    } else if (h.startsWith('triggers')) {
      ast.triggers = parseTriggers(child);
    } else if (h.startsWith('parameters')) {
      ast.parameters = parseParameters(child);
    } else if (h.startsWith('environment')) {
      ast.environment = parseEnvironment(child);
    } else if (h.startsWith('tools')) {
      ast.tools = parseTools(child);
    } else if (h.startsWith('stages')) {
      ast.stages = parseStages(child);
    } else if (h.startsWith('post')) {
      ast.post = parsePost(child);
    }
  }
}


// ======================== AGENT ========================

function parseAgent(block) {
  const bodyTrimmed = block.body.trim();

  // agent any / agent none
  if (bodyTrimmed === 'any' || bodyTrimmed === 'none') {
    return { type: bodyTrimmed, details: bodyTrimmed };
  }

  // agent { docker { ... } } or agent { kubernetes { ... } }
  const child = block.children[0];
  if (child) {
    const type = child.header.trim();
    const result = { type, details: child.body };
    const lines = child.body.split('\n').map((l) => l.trim()).filter((l) => l);
    for (const line of lines) {
      if (line.startsWith('image ')) result.image = extractStringLiteral(line.substring(6));
      if (line.startsWith('label ')) result.label = extractStringLiteral(line.substring(6));
      if (line.startsWith('args ')) result.args = extractStringLiteral(line.substring(5));
      if (line.startsWith('yaml ')) result.yaml = extractStringLiteral(line.substring(5));
    }
    return result;
  }

  return { type: 'unknown', details: bodyTrimmed };
}


// ======================== OPTIONS ========================

function parseOptionsList(block) {
  return block.body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const match = line.match(/^(\w+)\s*\((.*)\)$/s);
      if (match) return { name: match[1], value: match[2] };
      return { name: line.replace(/\(\)$/, ''), value: '' };
    });
}


// ======================== TRIGGERS ========================

function parseTriggers(block) {
  const optionsList = [];
  const lines = block.body.split('\n').map(l => l.trim()).filter(l => l);
  for (const line of lines) {
    if (line.includes('(')) {
      const name = line.split('(')[0].trim();
      const value = line.substring(line.indexOf('(') + 1, line.lastIndexOf(')')).trim();
      optionsList.push({ name, value: extractStringLiteral(value) });
    } else {
      optionsList.push({ name: line, value: '' });
    }
  }
  return optionsList;
}


// ======================== PARAMETERS ========================

function parseParameters(block) {
  return block.body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => {
      const match = line.match(/^(\w+)\s*\((.*)\)$/s);
      if (match) {
        const type = match[1];
        const inner = match[2];
        const params = {};

        const kvMatches = [...inner.matchAll(/(\w+)\s*:\s*('[^']*'|"[^"]*"|\[[^\]]*\]|[^,]+)/g)];
        kvMatches.forEach((m) => {
          params[m[1]] = extractStringLiteral(m[2].trim());
        });

        if (inner.includes('choices:')) {
          const choicesMatch = inner.match(/choices:\s*\[(.*?)\]/);
          if (choicesMatch) {
            params.choices = choicesMatch[1].split(',').map((s) => extractStringLiteral(s.trim()));
          }
        }

        return {
          type,
          name: params.name || '',
          defaultValue: params.defaultValue || '',
          description: params.description || '',
          choices: params.choices,
        };
      }
      return { type: 'unknown', name: line, defaultValue: '', description: '' };
    });
}


// ======================== ENVIRONMENT ========================

function parseEnvironment(block) {
  const env = {};
  block.body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l)
    .forEach((line) => {
      const eqIdx = line.indexOf('=');
      if (eqIdx > -1) {
        const key = line.substring(0, eqIdx).trim();
        const val = line.substring(eqIdx + 1).trim();
        env[key] = extractStringLiteral(val);
      }
    });
  return env;
}


// ======================== STAGES ========================

function parseStages(block) {
  return block.children
    .filter((c) => c.header.startsWith('stage'))
    .map((stageBlock) => {
      const nameMatch = stageBlock.header.match(/stage\s*\(\s*['"](.+?)['"]\s*\)/);
      const name = nameMatch ? nameMatch[1] : 'Unknown';

      const stageAst = {
        name,
        agent: null,
        options: [],
        when: null,
        steps: [],
        parallel: null,
        post: null,
        sourceCode: stageBlock.raw,
      };

      for (const child of stageBlock.children) {
        const h = child.header;
        if (h === 'steps') {
          stageAst.steps = parseSteps(child);
        } else if (h.startsWith('agent')) {
          stageAst.agent = parseAgent(child);
        } else if (h.startsWith('options')) {
          stageAst.options = parseOptionsList(child);
        } else if (h === 'parallel') {
          stageAst.parallel = parseStages(child);
        } else if (h === 'stages') {
          stageAst.stages = parseStages(child);
        } else if (h === 'matrix') {
          stageAst.matrix = parseMatrix(child);
        } else if (h.startsWith('when')) {
          stageAst.when = parseWhen(child);
        } else if (h.startsWith('post')) {
          stageAst.post = parsePost(child);
        } else if (h.startsWith('tools')) {
          stageAst.tools = parseTools(child);
        }
      }

      return stageAst;
    });
}


// ======================== WHEN ========================

function parseWhen(block) {
  // Check for nested expression block
  const exprChild = block.children.find((c) => c.header === 'expression');
  if (exprChild) {
    return { type: 'expression', value: exprChild.body.trim(), raw: exprChild.raw };
  }

  // Check for anyOf / allOf
  const anyOfChild = block.children.find((c) => c.header === 'anyOf');
  if (anyOfChild) {
    const body = anyOfChild.body.trim();
    const branchMatches = [...body.matchAll(/branch\s+['"](.+?)['"]/g)];
    if (branchMatches.length > 0) {
      return { type: 'branch', value: branchMatches[0][1], raw: body, branches: branchMatches.map(m => m[1]) };
    }
    return { type: 'anyOf', value: body, raw: body };
  }

  const allOfChild = block.children.find((c) => c.header === 'allOf');
  if (allOfChild) {
    const body = allOfChild.body.trim();
    const branchMatch = body.match(/branch\s+['"](.+?)['"]/);
    if (branchMatch) {
      return { type: 'branch', value: branchMatch[1], raw: body };
    }
    return { type: 'allOf', value: body, raw: body };
  }

  // Check for branch directive in body
  const body = block.body.trim();
  const branchMatch = body.match(/branch\s+['"](.+?)['"]/);
  if (branchMatch) {
    return { type: 'branch', value: branchMatch[1], raw: body };
  }

  return { type: 'unknown', value: body, raw: body };
}


// ======================== MATRIX ========================

function parseMatrix(block) {
  const matrixAst = { axes: [], excludes: [], stages: [] };
  for (const child of block.children) {
    if (child.header === 'axes') {
      matrixAst.axes = child.children.filter(c => c.header === 'axis').map(axis => {
        const body = axis.body.trim();
        const nameMatch = body.match(/name\s+['"](.+?)['"]/);
        const valuesMatch = body.match(/values\s+(.+)/);
        return {
          name: nameMatch ? nameMatch[1] : 'Unknown',
          values: valuesMatch ? valuesMatch[1].split(',').map(s => extractStringLiteral(s.trim())) : []
        };
      });
    } else if (child.header === 'excludes') {
      matrixAst.excludes = child.children.filter(c => c.header === 'exclude').map(exc => exc.body.trim());
    } else if (child.header === 'stages') {
      matrixAst.stages = parseStages(child);
    }
  }
  return matrixAst;
}

// ======================== TOOLS ========================

function parseTools(block) {
  const tools = {};
  block.body.split('\n').map(l => l.trim()).filter(l => l.length > 0).forEach(line => {
    const parts = line.split(/\s+/);
    if (parts.length >= 2) {
      tools[parts[0]] = extractStringLiteral(parts[1]);
    }
  });
  return tools;
}

// ======================== STEPS ========================

function parseSteps(block) {
  const steps = [];
  const lines = block.body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    let type = 'unknown';
    let command = '';

    if (line.startsWith('sh '))               { type = 'sh';               command = extractStringLiteral(line.substring(3)); }
    else if (line.startsWith('echo '))         { type = 'echo';             command = extractStringLiteral(line.substring(5)); }
    else if (line.startsWith('archiveArtifacts ')) { type = 'archiveArtifacts'; command = line.substring(17).trim(); }
    else if (line.startsWith('junit '))        { type = 'junit';            command = extractStringLiteral(line.substring(6)); }
    else if (line.startsWith('publishHTML'))   { type = 'publishHTML';      command = line.substring(11).trim(); }
    else if (line.startsWith('stash '))        { type = 'stash';            command = line.substring(6).trim(); }
    else if (line.startsWith('unstash '))      { type = 'unstash';          command = extractStringLiteral(line.substring(8)); }
    else if (line.startsWith('input '))        { type = 'input';            command = line.substring(6).trim(); }
    else if (line.startsWith('slackSend '))    { type = 'slackSend';        command = line.substring(10).trim(); }
    else if (line.startsWith('mail '))         { type = 'mail';             command = line.substring(5).trim(); }
    else if (line.startsWith('script'))        { type = 'script';           command = line; }
    else if (line.startsWith('retry'))         { type = 'retry';            command = line; }
    else if (line.startsWith('timeout'))       { type = 'timeout';          command = line; }
    else if (line.startsWith('deleteDir'))     { type = 'deleteDir';        command = line; }
    else                                       { type = line.split(/[\s(]/)[0]; command = line; }

    steps.push({ type, command, raw: line });
  }

  // Also scan child blocks for steps that wrap other steps (script {}, timeout {})
  for (const child of block.children) {
    if (child.header.startsWith('script')) {
      steps.push({ type: 'script', command: child.body.trim(), raw: child.raw });
    } else if (child.header.startsWith('withCredentials')) {
      // Parse steps inside withCredentials blocks
      const innerSteps = parseSteps(child);
      steps.push(...innerSteps);
    }
  }

  return steps;
}


// ======================== POST ========================

function parsePost(block) {
  const post = {};
  for (const child of block.children) {
    post[child.header] = parseSteps(child);
  }
  return post;
}


// ======================== UTILITIES ========================

/**
 * Extract all unique branch patterns from when blocks in the AST.
 */
export function extractBranches(ast) {
  const branches = new Set();

  function traverse(stages) {
    if (!stages) return;
    for (const stage of stages) {
      if (stage.when && stage.when.type === 'branch') {
        branches.add(stage.when.value);
        if (stage.when.branches) {
          stage.when.branches.forEach(b => branches.add(b));
        }
      }
      if (stage.parallel) {
        traverse(stage.parallel);
      }
    }
  }

  traverse(ast.stages);
  return Array.from(branches);
}
