const fs = require('fs');
const file = 'surf-mobile/src/components/PostCard.tsx';
let content = fs.readFileSync(file, 'utf8');

if (!content.substring(0, 1000).includes('TextInput')) {
  content = content.replace(/from 'react-native';/, "from 'react-native';\nimport { TextInput } from 'react-native';");
  fs.writeFileSync(file, content);
  console.log('TextInput added');
} else {
  console.log('TextInput already present');
}
