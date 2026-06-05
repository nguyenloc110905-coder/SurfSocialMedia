import React from 'react';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@/navigation';
import MarketplaceScreen from '@/screens/MarketplaceScreen';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'MyListings'>;
};

export default function MyListingsScreen({ navigation }: Props) {
  return (
    <MarketplaceScreen
      navigation={navigation}
      initialTab="seller"
      safeTop
      showHeader
      showBackButton
    />
  );
}
