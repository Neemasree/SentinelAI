#!/usr/bin/env node

/**
 * Security Audit Script for SentinelAI Gateway
 * Run with: node security-audit.js
 */

const fs = require('fs');
const path = require('path');

const securityIssues = [];

function checkFile(filePath, content) {
  const filename = path.basename(filePath);
  
  // Check for hardcoded credentials
  const credentialPatterns = [
    /password\s*[:=]\s*["'][^"']*["']/gi,
    /api[_-]?key\s*[:=]\s*["'][^"']*["']/gi,
    /secret\s*[:=]\s*["'][^"']*["']/gi,
    /token\s*[:=]\s*["'][^"']*["']/gi,
    /jwt[_-]?secret\s*[:=]\s*["'][^"']*["']/gi
  ];
  
  credentialPatterns.forEach((pattern, index) => {
    const matches = content.match(pattern);
    if (matches) {
      securityIssues.push({
        file: filePath,
        issue: 'Hardcoded credentials',
        details: `Found ${matches.length} potential credential(s)`,
        severity: 'HIGH'
      });
    }
  });
  
  // Check for console.log in production code
  if (content.includes('console.log') && !filePath.includes('security-audit')) {
    securityIssues.push({
      file: filePath,
      issue: 'Debug logging in code',
      details: 'console.log statements should be removed from production code',
      severity: 'LOW'
    });
  }
  
  // Check for eval or Function constructor
  if (content.includes('eval(') || content.includes('new Function(')) {
    securityIssues.push({
      file: filePath,
      issue: 'Dangerous code execution',
      details: 'eval() or Function() constructor found',
      severity: 'CRITICAL'
    });
  }
  
  // Check for inline SQL
  if (content.match(/SELECT|INSERT|UPDATE|DELETE.*['"`]/gi)) {
    securityIssues.push({
      file: filePath,
      issue: 'Potential SQL injection',
      details: 'Raw SQL queries found',
      severity: 'HIGH'
    });
  }
  
  // Check for weak crypto
  if (content.includes('Math.random()') && content.includes('crypto')) {
    securityIssues.push({
      file: filePath,
      issue: 'Weak random number generation',
      details: 'Math.random() should not be used for cryptographic purposes',
      severity: 'MEDIUM'
    });
  }
}

function scanDirectory(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      // Skip node_modules and build directories
      if (!file.name.includes('node_modules') && !file.name.includes('dist') && !file.name.includes('build')) {
        scanDirectory(fullPath);
      }
    } else if (file.name.endsWith('.ts') || file.name.endsWith('.tsx') || file.name.endsWith('.js')) {
      try {
        const content = fs.readFileSync(fullPath, 'utf8');
        checkFile(fullPath, content);
      } catch (err) {
        console.error(`Error reading ${fullPath}:`, err.message);
      }
    }
  }
}

function checkEnvironment() {
  const envExample = path.join(__dirname, '.env.example');
  const envFile = path.join(__dirname, '.env');
  
  if (fs.existsSync(envExample)) {
    const exampleContent = fs.readFileSync(envExample, 'utf8');
    
    // Check for default secrets in .env.example
    if (exampleContent.includes('change-in-production') || exampleContent.includes('your-secret')) {
      securityIssues.push({
        file: '.env.example',
        issue: 'Default secrets in example file',
        details: '.env.example should not contain actual secrets',
        severity: 'MEDIUM'
      });
    }
  }
  
  if (fs.existsSync(envFile)) {
    console.warn('⚠️  .env file exists - ensure it contains proper production values');
  }
}

function checkPackageJson() {
  const packagePath = path.join(__dirname, 'package.json');
  
  if (fs.existsSync(packagePath)) {
    const packageContent = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    
    // Check for outdated dependencies
    const dependencies = {
      ...packageContent.dependencies,
      ...packageContent.devDependencies
    };
    
    const knownVulnerablePackages = [
      'lodash',
      'moment',
      'express',
      'jsonwebtoken'
    ];
    
    knownVulnerablePackages.forEach(pkg => {
      if (dependencies[pkg]) {
        securityIssues.push({
          file: 'package.json',
          issue: 'Potential vulnerable dependency',
          details: `${pkg} should be kept updated`,
          severity: 'MEDIUM'
        });
      }
    });
  }
}

function main() {
  console.log('🔒 Starting security audit for SentinelAI Gateway...\n');
  
  // Check environment files
  checkEnvironment();
  
  // Check package.json
  checkPackageJson();
  
  // Scan source code
  scanDirectory(path.join(__dirname, 'src'));
  
  // Display results
  console.log(`📊 Security Audit Results:\n`);
  console.log(`Total issues found: ${securityIssues.length}\n`);
  
  if (securityIssues.length === 0) {
    console.log('✅ No security issues found!');
    return;
  }
  
  // Group by severity
  const bySeverity = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };
  
  securityIssues.forEach(issue => {
    bySeverity[issue.severity].push(issue);
  });
  
  // Display by severity
  Object.entries(bySeverity).forEach(([severity, issues]) => {
    if (issues.length > 0) {
      console.log(`\n${severity} Severity Issues (${issues.length}):`);
      console.log('='.repeat(50));
      
      issues.forEach((issue, index) => {
        console.log(`\n${index + 1}. ${issue.file}`);
        console.log(`   Issue: ${issue.issue}`);
        console.log(`   Details: ${issue.details}`);
      });
    }
  });
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📋 Summary:');
  console.log(`Critical: ${bySeverity.CRITICAL.length}`);
  console.log(`High: ${bySeverity.HIGH.length}`);
  console.log(`Medium: ${bySeverity.MEDIUM.length}`);
  console.log(`Low: ${bySeverity.LOW.length}`);
  
  if (bySeverity.CRITICAL.length > 0 || bySeverity.HIGH.length > 0) {
    console.log('\n❌ Critical or High severity issues found!');
    console.log('Please fix these before deploying to production.');
    process.exit(1);
  } else {
    console.log('\n✅ No critical or high severity issues found.');
  }
}

if (require.main === module) {
  main();
}

module.exports = { checkFile, scanDirectory };