import React, { useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppLens } from '@applens/react-native';
import { ProductStackParamList } from '../navigation/AppNavigator';
import { useCart } from '../store/cartStore';

type Props = NativeStackScreenProps<ProductStackParamList, 'ProductDetail'>;

function renderStars(rate: number): string {
  const full = Math.round(rate);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

export default function ProductDetailScreen({ route }: Props): React.JSX.Element {
  const { product } = route.params;
  const { addItem } = useCart();
  const [showBanner, setShowBanner] = useState(false);

  const handleAddToCart = () => {
    addItem(product);
    AppLens.trackEvent('add_to_cart', {
      productId: product.id,
      title: product.title,
      price: product.price,
    });
    console.log('Added to cart:', product.title);

    setShowBanner(true);
    setTimeout(() => setShowBanner(false), 1500);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image
          source={{ uri: product.image }}
          style={styles.image}
          resizeMode="contain"
        />

        <View style={styles.body}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{product.category}</Text>
          </View>

          <Text style={styles.title}>{product.title}</Text>

          <View style={styles.ratingRow}>
            <Text style={styles.stars}>{renderStars(product.rating.rate)}</Text>
            <Text style={styles.ratingText}>
              {product.rating.rate.toFixed(1)} ({product.rating.count} reviews)
            </Text>
          </View>

          <Text style={styles.price}>${product.price.toFixed(2)}</Text>

          <Text style={styles.descriptionLabel}>Description</Text>
          <Text style={styles.description}>{product.description}</Text>
        </View>
      </ScrollView>

      {showBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>✓ Added to cart!</Text>
        </View>
      )}

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleAddToCart}
          activeOpacity={0.85}>
          <Text style={styles.addButtonText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { paddingBottom: 100 },
  image: { width: '100%', height: 280, backgroundColor: '#F9FAFB' },
  body: { padding: 20 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 12,
  },
  badgeText: { fontSize: 12, color: '#5B21B6', textTransform: 'capitalize' },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    lineHeight: 28,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  stars: { fontSize: 18, color: '#F59E0B' },
  ratingText: { fontSize: 14, color: '#6B7280' },
  price: { fontSize: 28, fontWeight: '800', color: '#4F46E5', marginBottom: 20 },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  description: { fontSize: 14, color: '#6B7280', lineHeight: 22 },
  banner: {
    position: 'absolute',
    top: 16,
    alignSelf: 'center',
    backgroundColor: '#10B981',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  bannerText: { color: '#FFFFFF', fontWeight: '600', fontSize: 14 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  addButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  addButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
