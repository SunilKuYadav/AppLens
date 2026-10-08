import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

interface JSONViewerProps {
  data: unknown;
  maxHeight?: number;
}

type TokenType = 'key' | 'string' | 'literal' | 'plain';

interface Token {
  text: string;
  type: TokenType;
}

/**
 * Tokenize a pretty-printed JSON string into colored spans.
 *
 * We re-scan the already-formatted output rather than walking the data so the
 * exact JSON.stringify layout (indentation, punctuation) is preserved.
 */
function tokenizeJSON(formatted: string): Token[] {
  const tokens: Token[] = [];
  // Match: strings (as keys when followed by ':'), numbers, booleans, null.
  const regex = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(formatted)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: formatted.slice(lastIndex, match.index), type: 'plain' });
    }

    const [, stringLiteral, colon, keyword, numberLiteral] = match;

    if (stringLiteral != null) {
      if (colon != null) {
        // "key":  → key span + the colon as plain
        tokens.push({ text: stringLiteral, type: 'key' });
        tokens.push({ text: colon, type: 'plain' });
      } else {
        tokens.push({ text: stringLiteral, type: 'string' });
      }
    } else if (keyword != null) {
      tokens.push({ text: keyword, type: 'literal' });
    } else if (numberLiteral != null) {
      tokens.push({ text: numberLiteral, type: 'literal' });
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < formatted.length) {
    tokens.push({ text: formatted.slice(lastIndex), type: 'plain' });
  }

  return tokens;
}

export function JSONViewer({ data, maxHeight = 300 }: JSONViewerProps): React.JSX.Element {
  const tokens = React.useMemo(() => {
    let formatted: string;
    try {
      formatted = JSON.stringify(data, null, 2);
    } catch {
      formatted = String(data);
    }
    if (formatted === undefined) {
      formatted = String(data);
    }
    return tokenizeJSON(formatted);
  }, [data]);

  return (
    <ScrollView
      style={[styles.outer, { maxHeight }]}
      nestedScrollEnabled
    >
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
        <Text style={styles.base}>
          {tokens.map((token, index) => (
            <Text key={index} style={styles[token.type]}>
              {token.text}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: '#111',
    borderRadius: 6,
    padding: 8,
  },
  base: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
    color: '#e8e8e8',
  },
  key: {
    color: '#00ff88',
  },
  string: {
    color: '#b8d7a3',
  },
  literal: {
    color: '#f0a35e',
  },
  plain: {
    color: '#777',
  },
});
