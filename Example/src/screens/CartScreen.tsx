import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppLens } from '@applens/react-native';
import { useCart } from '../store/cartStore';
import { CartItem } from '../types/product';

export default function CartScreen(): React.JSX.Element {
  const { items, removeItem, increment, decrement, clearCart, totalPrice, totalItems } =
    useCart();
  const [ordering, setOrdering] = useState(false);

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      return;
    }

    console.log('Placing order...', { itemCount: totalItems, totalPrice });
    setOrdering(true);

    try {
      const response = await fetch('https://fakestoreapi.com/carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 1,
          date: new Date().toISOString(),
          products: items.map((i) => ({
            productId: i.product.id,
            quantity: i.quantity,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      AppLens.trackEvent('order_placed', {
        itemCount: totalItems,
        totalPrice,
      });

      clearCart();
      Alert.alert('Order Placed! 🎉', 'Your order has been placed successfully.');
    } catch (err) {
      console.error('Order failed:', err);
      Alert.alert('Order Failed', 'Something went wrong. Please try again.');
    } finally {
      setOrdering(false);
    }
  };

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Browse the Products tab and add items to get started.
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: CartItem }) => (
    <View style={styles.card}>
      <Image
        source={{ uri: item.product.image }}
        style={styles.image}
        resizeMode="contain"
      />
      <View style={styles.info}>
        <Text style={styles.itemTitle} numberOfLines={2}>
          {item.product.title}
        </Text>
        <Text style={styles.itemPrice}>${item.product.price.toFixed(2)}</Text>

        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => decrement(item.product.id)}>
            <Text style={styles.qtyButtonText}>−</Text>
          </TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => increment(item.product.id)}>
            <Text style={styles.qtyButtonText}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => removeItem(item.product.id)}>
            <Text style={styles.removeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.product.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      <View style={styles.footer}>
        <View style={styles.totals}>
          <Text style={styles.totalLabel}>
            {totalItems} {totalItems === 1 ? 'item' : 'items'}
          </Text>
          <Text style={styles.totalPrice}>${totalPrice.toFixed(2)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.orderButton, ordering && styles.orderButtonDisabled]}
          onPress={handlePlaceOrder}
          disabled={ordering}
          activeOpacity={0.85}>
          <Text style={styles.orderButtonText}>
            {ordering ? 'Placing Order…' : 'Place Order'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
  },
  list: { padding: 12, paddingBottom: 8 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  image: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#F9FAFB' },
  info: { flex: 1, marginLeft: 12 },
  itemTitle: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    marginBottom: 4,
  },
  itemPrice: { fontSize: 15, fontWeight: '700', color: '#4F46E5', marginBottom: 8 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: { fontSize: 16, fontWeight: '700', color: '#4F46E5' },
  quantity: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    minWidth: 20,
    textAlign: 'center',
  },
  removeButton: {
    marginLeft: 'auto',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: { fontSize: 12, color: '#EF4444', fontWeight: '700' },
  footer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  totals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: { fontSize: 15, color: '#6B7280' },
  totalPrice: { fontSize: 22, fontWeight: '800', color: '#111827' },
  orderButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  orderButtonDisabled: { backgroundColor: '#A5B4FC' },
  orderButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
