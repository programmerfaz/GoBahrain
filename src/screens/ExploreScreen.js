import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenContainer from '../components/ScreenContainer';
import { sendChatToN8n } from '../services/n8nApi';

const COLORS = {
  primary: '#C8102E',
  screenBg: '#F8FAFC',
  userBubble: '#C8102E',
  botBubble: '#E2E8F0',
  textPrimary: '#0F172A',
  textMuted: '#64748B',
  border: 'rgba(226,232,240,0.9)',
};

const WELCOME = "Hi! I'm here to help you explore Bahrain. Ask me about places, food, culture, or plan a trip.";

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const listRef = useRef(null);
  const [messages, setMessages] = useState([
    { id: 'welcome', role: 'assistant', text: WELCOME },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput('');
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await sendChatToN8n(text);
      const replyText = result.success ? result.text : (result.error || 'Something went wrong. Try again.');
      const botMsg = { id: `b-${Date.now()}`, role: 'assistant', text: replyText };
      setMessages((prev) => [...prev, botMsg]);
    } catch (e) {
      const botMsg = { id: `b-${Date.now()}`, role: 'assistant', text: e?.message || 'Network error. Try again.' };
      setMessages((prev) => [...prev, botMsg]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer showHeader headerTitle="Chat">
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[styles.bubbleWrap, item.role === 'user' ? styles.userWrap : styles.botWrap]}>
              <View style={[styles.bubble, item.role === 'user' ? styles.userBubble : styles.botBubble]}>
                <Text style={[styles.bubbleText, item.role === 'user' ? styles.userBubbleText : styles.botBubbleText]}>
                  {item.text}
                </Text>
              </View>
            </View>
          )}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 8 }]}
          inverted={false}
          ListFooterComponent={
            loading ? (
              <View style={[styles.bubbleWrap, styles.botWrap]}>
                <View style={[styles.bubble, styles.botBubble, styles.loadingBubble]}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
                  <Text style={[styles.bubbleText, styles.botBubbleText, styles.loadingText]}>Thinking...</Text>
                </View>
              </View>
            ) : null
          }
        />

        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 8) + 8 }]}>
          <TextInput
            style={styles.input}
            placeholder="Ask about Bahrain..."
            placeholderTextColor={COLORS.textMuted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            editable={!loading}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
            activeOpacity={0.8}
          >
            <Ionicons name="send" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.screenBg,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    flexGrow: 1,
  },
  bubbleWrap: {
    marginBottom: 12,
    flexDirection: 'row',
  },
  userWrap: {
    justifyContent: 'flex-end',
  },
  botWrap: {
    justifyContent: 'flex-start',
  },
  bubble: {
    maxWidth: '85%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
  },
  userBubble: {
    backgroundColor: COLORS.userBubble,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: COLORS.botBubble,
    borderBottomLeftRadius: 4,
  },
  loadingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userBubbleText: {
    color: '#FFFFFF',
  },
  botBubbleText: {
    color: COLORS.textPrimary,
  },
  loadingText: {
    color: COLORS.textMuted,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    backgroundColor: COLORS.screenBg,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
