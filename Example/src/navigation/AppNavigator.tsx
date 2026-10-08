import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';

import ProductListScreen from '../screens/ProductListScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import CartScreen from '../screens/CartScreen';
import OrdersScreen from '../screens/OrdersScreen';
import AILabScreen from '../screens/AILabScreen';
import { Product } from '../types/product';

// ─── Param list types ─────────────────────────────────────────────────────────

export type ProductStackParamList = {
  ProductList: undefined;
  ProductDetail: { product: Product };
};

export type RootTabParamList = {
  Products: undefined;
  Cart: undefined;
  Orders: undefined;
  'AI Lab': undefined;
};

// ─── Navigators ───────────────────────────────────────────────────────────────

const Tab = createBottomTabNavigator<RootTabParamList>();
const ProductStack = createNativeStackNavigator<ProductStackParamList>();

function ProductStackNavigator(): React.JSX.Element {
  return (
    <ProductStack.Navigator>
      <ProductStack.Screen
        name="ProductList"
        component={ProductListScreen}
        options={{ title: 'Products' }}
      />
      <ProductStack.Screen
        name="ProductDetail"
        component={ProductDetailScreen}
        options={{ title: 'Product Details' }}
      />
    </ProductStack.Navigator>
  );
}

export function AppNavigator(): React.JSX.Element {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }: { color: string; size: number }) => {
          let icon = '🛍️';
          if (route.name === 'Cart') {
            icon = '🛒';
          } else if (route.name === 'Orders') {
            icon = '📦';
          } else if (route.name === 'AI Lab') {
            icon = '🧪';
          }
          return <Text style={{ fontSize: size, color }}>{icon}</Text>;
        },
        headerShown: false,
      })}>
      <Tab.Screen name="Products" component={ProductStackNavigator} />
      <Tab.Screen name="Cart" component={CartScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="AI Lab" component={AILabScreen} />
    </Tab.Navigator>
  );
}
