import React, { useCallback, useRef } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Animated,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../context/ThemeContext'
import { useCart } from '../context/CartContext'
import { LUXURY } from '../theme/luxuryPremium'

const SERVICE_FEE_RATE = 0.05

const parseBHD = (priceRange) => parseFloat(priceRange) || 0

const formatBHD = (value) => `${value.toFixed(3)} BHD`

// ─── Item row ────────────────────────────────────────────────────────────────

function CartItemRow({ item, onIncrease, onDecrease, colors, styles }) {
  const scaleAnim = useRef(new Animated.Value(1)).current

  const pulse = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start()
  }

  const handleIncrease = () => { pulse(); onIncrease() }
  const handleDecrease = () => { pulse(); onDecrease() }

  const unitPrice = parseBHD(item.priceRange)
  const lineTotal = unitPrice * item.quantity

  return (
    <Animated.View style={[styles.itemCard, { transform: [{ scale: scaleAnim }] }]}>
      {/* Thumbnail */}
      <View style={styles.itemThumb}>
        {item.imageUri
          ? <Image source={{ uri: item.imageUri }} style={styles.itemThumbImg} resizeMode="cover" />
          : <View style={[styles.itemThumbImg, styles.itemThumbFallback]}>
              <Ionicons name="image-outline" size={22} color={colors.textMuted} />
            </View>
        }
      </View>

      {/* Info */}
      <View style={styles.itemBody}>
        <Text style={styles.itemName} numberOfLines={2}>
          {item.description?.trim() || item.businessName}
        </Text>
        {item.priceRange ? (
          <Text style={styles.itemUnitPrice}>{item.priceRange} / item</Text>
        ) : null}
        <View style={styles.itemFooterRow}>
          {/* Qty controls */}
          <View style={styles.qtyRow}>
            <TouchableOpacity
              style={[styles.qtyBtn, item.quantity === 1 && styles.qtyBtnDanger]}
              onPress={handleDecrease}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={item.quantity === 1 ? 'trash-outline' : 'remove'}
                size={14}
                color={item.quantity === 1 ? '#ef4444' : colors.primary}
              />
            </TouchableOpacity>
            <Text style={styles.qtyValue}>{item.quantity}</Text>
            <TouchableOpacity
              style={styles.qtyBtn}
              onPress={handleIncrease}
              activeOpacity={0.75}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="add" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>
          {/* Line total */}
          {lineTotal > 0 ? (
            <Text style={styles.itemLineTotal}>{formatBHD(lineTotal)}</Text>
          ) : null}
        </View>
      </View>
    </Animated.View>
  )
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function CartScreen() {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { colors, isDark } = useTheme()
  const { items, count, clientId, clientName, subtotal, updateQty, removeItem, reset } = useCart()

  const styles = makeStyles(colors, isDark)

  const serviceFee = subtotal * SERVICE_FEE_RATE
  const total = subtotal + serviceFee

  const handleClearCart = useCallback(() => {
    if (items.length === 0) return
    Alert.alert(
      'Clear cart?',
      'All items will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: reset },
      ]
    )
  }, [items.length, reset])

  const handlePlaceOrder = useCallback(() => {
    Alert.alert(
      'Order placed!',
      `Your order from ${clientName || 'the venue'} has been placed. Total: ${formatBHD(total)}`,
      [{ text: 'Great!', onPress: () => { reset(); navigation.goBack() } }]
    )
  }, [clientName, total, reset, navigation])

  // ── Venue header ───────────────────────────────────────────────────────────
  const venueItem = items[0]

  const ListHeader = useCallback(() => (
    <View>
      {/* Venue banner */}
      {venueItem ? (
        <View style={styles.venueBanner}>
          <View style={styles.venueIconWrap}>
            {venueItem.clientImage
              ? <Image source={{ uri: venueItem.clientImage }} style={styles.venueImg} resizeMode="cover" />
              : <Ionicons name="storefront" size={24} color={colors.primary} />
            }
          </View>
          <View style={styles.venueInfo}>
            <Text style={styles.venueName} numberOfLines={1}>{clientName || 'Venue'}</Text>
            <Text style={styles.venueSub}>{count} {count === 1 ? 'item' : 'items'} in cart</Text>
          </View>
          <View style={[styles.venueTypePill, { backgroundColor: colors.primary + '18' }]}>
            <Ionicons name="cart-outline" size={12} color={colors.primary} />
            <Text style={[styles.venueTypeText, { color: colors.primary }]}>Active</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Your items</Text>
    </View>
  ), [venueItem, clientName, count, colors, styles])

  // ── Empty state ────────────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cart</Text>
          <View style={styles.backBtn} />
        </View>

        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIconCircle, { backgroundColor: colors.primary + '12' }]}>
            <Ionicons name="cart-outline" size={52} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Your cart is empty</Text>
          <Text style={styles.emptySub}>Items you save to your cart will show up here</Text>
          <TouchableOpacity
            style={[styles.browseBtn, { backgroundColor: colors.primary }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <Ionicons name="arrow-back" size={16} color="#fff" />
            <Text style={styles.browseBtnText}>Browse posts</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // ── Filled state ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-down" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Cart</Text>
        <TouchableOpacity style={styles.backBtn} onPress={handleClearCart} activeOpacity={0.7}>
          <Ionicons name="trash-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </View>

      {/* Items list */}
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 280 }]}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <CartItemRow
            item={item}
            colors={colors}
            styles={styles}
            onIncrease={() => updateQty(item.id, item.quantity + 1)}
            onDecrease={() => updateQty(item.id, item.quantity - 1)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Sticky footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {/* Order summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Order summary</Text>

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Subtotal ({count} {count === 1 ? 'item' : 'items'})</Text>
            <Text style={styles.summaryValue}>{formatBHD(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Service fee (5%)</Text>
            <Text style={styles.summaryValue}>{formatBHD(serviceFee)}</Text>
          </View>

          <View style={styles.summaryDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotal}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatBHD(total)}</Text>
          </View>
        </View>

        {/* Place order CTA */}
        <TouchableOpacity
          style={[styles.placeOrderBtn, { backgroundColor: colors.primary }]}
          activeOpacity={0.88}
          onPress={handlePlaceOrder}
        >
          <Text style={styles.placeOrderText}>Place Order</Text>
          <View style={styles.placeOrderArrow}>
            <Ionicons name="arrow-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors, isDark) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.borderLight,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },

  // List
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 20,
  },
  separator: {
    height: 10,
  },

  // Venue banner
  venueBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: LUXURY.radiusCard,
    backgroundColor: colors.surface,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  venueIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  venueImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  venueInfo: {
    flex: 1,
  },
  venueName: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  venueSub: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  venueTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  venueTypeText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Item card
  itemCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: LUXURY.radiusCard,
    padding: 14,
    gap: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10 },
      android: { elevation: 3 },
    }),
  },
  itemThumb: {
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
    flexShrink: 0,
  },
  itemThumbImg: {
    width: '100%',
    height: '100%',
  },
  itemThumbFallback: {
    backgroundColor: colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: {
    flex: 1,
    gap: 4,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 19,
  },
  itemUnitPrice: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  itemFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  itemLineTotal: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textPrimary,
  },

  // Qty controls
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.borderLight,
    borderRadius: 20,
    paddingHorizontal: 4,
    paddingVertical: 4,
    gap: 2,
    alignSelf: 'flex-start',
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  qtyBtnDanger: {
    borderColor: '#ef4444' + '44',
    backgroundColor: '#ef444408',
  },
  qtyValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.textPrimary,
    minWidth: 22,
    textAlign: 'center',
  },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -6 }, shadowOpacity: 0.06, shadowRadius: 12 },
      android: { elevation: 10 },
    }),
  },
  summaryCard: {
    gap: 8,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  summaryTotal: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  summaryTotalValue: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },

  // Place order
  placeOrderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: LUXURY.radiusPill,
    paddingVertical: 16,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  placeOrderText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.2,
  },
  placeOrderArrow: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  emptyIconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 13,
    borderRadius: LUXURY.radiusPill,
    marginTop: 8,
    ...Platform.select({
      ios: { shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.30, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  browseBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
})
