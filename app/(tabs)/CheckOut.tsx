import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    ScrollView,
    TouchableOpacity,
    View,
    Text,
    StyleSheet,
    ActivityIndicator,
    Alert,
    RefreshControl,
    FlatList // Đảm bảo FlatList được import
} from 'react-native';
import { Stack, router } from 'expo-router';
import { useFirestore } from '@/context/storageFirebase';
import { useAuth } from '@/context/AuthContext';
import { Ionicons, Feather } from '@expo/vector-icons';

// --- Interfaces ---
interface TransactionItem {
    productId: string;
    quantity: number;
    price: number;
    productName: string;
}

// Interface cho collection 'transactions' (Dùng cho tab Đơn hàng)
interface Transaction {
    id: string;
    userId: string;
    storeName: string;
    items: TransactionItem[];
    totalAmount: number;
    status: 'pending' | 'completed' | 'cancelled' | 'unknown';
    createdAt: Date;
    updatedAt: Date;
    // Thêm type marker để phân biệt kiểu
    _type: 'transaction';
}

// Interface cho collection 'ship' (Dùng cho tab Vận chuyển) - Dựa trên hình ảnh
interface ShipDocument {
    id: string;
    customerId: string;
    deliveryAddress: string;
    idShipper?: string;
    shipperName?: string;
    itemsSummary: { productName: string; quantity: number }[];
    recipientName: string;
    recipientPhone: string;
    shipmentStatus: 'shipping' | 'arrived' | 'delivered' | string;
    totalAmount: number;
    arrivedAt?: Date;
    createdAt: Date;
    // Thêm type marker để phân biệt kiểu
    _type: 'shipment';
}

// --- Union Type ---
type DisplayItem = Transaction | ShipDocument; // Kiểu dữ liệu chung cho FlatList

// --- Component ---
export default function CheckOut() {
    const [mainActiveTab, setMainActiveTab] = useState<'orders' | 'shipping'>('orders');
    const [subActiveTab, setSubActiveTab] = useState<string>('all');

    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [shipDocs, setShipDocs] = useState<ShipDocument[]>([]);

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    const { getDocuments, updateDocument } = useFirestore();
    const { user } = useAuth();

    // --- Định nghĩa Tabs ---
    const orderTabs = [
        { id: 'all', label: 'Tất cả' },
        { id: 'pending', label: 'Đang xử lý' },
        { id: 'completed', label: 'Hoàn thành' },
        { id: 'cancelled', label: 'Đã hủy' }
    ];

    const shippingTabs = [
        { id: 'all', label: 'Tất cả' },
        { id: 'shipping_arrived', label: 'Đang vận chuyển' },
        { id: 'delivered', label: 'Đã giao' },
    ];

    const currentSubTabs = mainActiveTab === 'orders' ? orderTabs : shippingTabs;

    // --- Hàm tải dữ liệu ---
    const loadData = useCallback(async (isRefreshing = false) => {
        if (!user) {
            setTransactions([]);
            setShipDocs([]);
            if (!isRefreshing) setLoading(false);
            setRefreshing(false);
            return;
        }

        if (!isRefreshing) setLoading(true);
        setActionLoadingId(null);

        try {
            const transactionsPromise = getDocuments('transactions')
                .then(docs => docs
                    .filter(doc => doc.userId === user.uid)
                    .map(doc => ({
                        id: doc.id,
                        userId: doc.userId,
                        storeName: doc.storeName || 'N/A',
                        items: Array.isArray(doc.items) ? doc.items : [],
                        totalAmount: typeof doc.totalAmount === 'number' ? doc.totalAmount : 0,
                        status: ['pending', 'completed', 'cancelled'].includes(doc.status) ? doc.status : 'unknown',
                        createdAt: doc.createdAt?.toDate() || new Date(),
                        updatedAt: doc.updatedAt?.toDate() || new Date(),
                        _type: 'transaction' // <-- Thêm type marker
                    } as Transaction))
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                ).catch(err => { console.error("Error fetching transactions:", err); return []; });

            const shipDocsPromise = getDocuments('ship')
                .then(docs => docs
                    .filter(doc => doc.customerId === user.uid)
                    .map(doc => ({
                        id: doc.id,
                        customerId: doc.customerId,
                        deliveryAddress: doc.deliveryAddress || 'N/A',
                        idShipper: doc.idShipper,
                        shipperName: doc.shipperName,
                        itemsSummary: Array.isArray(doc.itemsSummary) ? doc.itemsSummary : [],
                        recipientName: doc.recipientName || 'N/A',
                        recipientPhone: doc.recipientPhone || 'N/A',
                        shipmentStatus: ['shipping', 'arrived', 'delivered'].includes(doc.shipmentStatus) ? doc.shipmentStatus : 'shipping',
                        totalAmount: typeof doc.totalAmount === 'number' ? doc.totalAmount : 0,
                        arrivedAt: doc.arrivedAt?.toDate(),
                        createdAt: doc.createdAt?.toDate() || new Date(),
                        _type: 'shipment' // <-- Thêm type marker
                    } as ShipDocument))
                    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                ).catch(err => { console.error("Error fetching ship docs:", err); return []; });

            const [fetchedTransactions, fetchedShipDocs] = await Promise.all([transactionsPromise, shipDocsPromise]);

            setTransactions(fetchedTransactions);
            setShipDocs(fetchedShipDocs);

        } catch (error) {
            console.error('Error loading data:', error);
            if (!isRefreshing) Alert.alert("Lỗi", "Không thể tải dữ liệu.");
            setTransactions([]);
            setShipDocs([]);
        } finally {
            if (!isRefreshing) setLoading(false);
            setRefreshing(false);
        }
    }, [user, getDocuments]);

    useEffect(() => { loadData(); }, [loadData]);

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData(true);
    }, [loadData]);

    // --- Lọc dữ liệu để hiển thị ---
    const displayData: DisplayItem[] = useMemo(() => {
        if (mainActiveTab === 'orders') {
            const filteredOrders = transactions.filter(t => {
                switch (subActiveTab) {
                    case 'all': return t.status !== 'cancelled'; // Hiện tất cả trừ đã hủy
                    case 'pending': return t.status === 'pending';
                    case 'completed': return t.status === 'completed';
                    case 'cancelled': return t.status === 'cancelled';
                    default: return true;
                }
            });
            return filteredOrders;
        } else { // mainActiveTab === 'shipping'
            const filteredShips = shipDocs.filter(s => {
                switch (subActiveTab) {
                    case 'all': return true;
                    case 'shipping_arrived': return s.shipmentStatus === 'shipping' || s.shipmentStatus === 'arrived';
                    case 'delivered': return s.shipmentStatus === 'delivered';
                    default: return true;
                }
            });
            return filteredShips;
        }
    }, [mainActiveTab, subActiveTab, transactions, shipDocs]);

    // --- Hàm xử lý Hủy đơn hàng ---
    const handleCancelOrder = async (transactionId: string) => {
        if (actionLoadingId) return;
        setActionLoadingId(transactionId);
        try {
            await updateDocument('transactions', transactionId, {
                status: 'cancelled',
                updatedAt: new Date()
            });
            setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, status: 'cancelled' } : t));
            // Có thể không cần Alert ở đây để tránh làm phiền người dùng
            // Alert.alert("Thành công", "Đã hủy đơn hàng.");
        } catch (error) {
            console.error(`Error cancelling order ${transactionId}:`, error);
            Alert.alert("Lỗi", "Không thể hủy đơn hàng.");
        } finally {
            setActionLoadingId(null);
        }
    };

    // --- Hàm xử lý Xác nhận đã nhận hàng ---
    const handleConfirmDelivery = async (shipDocId: string) => {
        if (actionLoadingId) return;
        setActionLoadingId(shipDocId);
        try {
            await updateDocument('ship', shipDocId, {
                shipmentStatus: 'delivered',
                updatedAt: new Date()
            });
            setShipDocs(prev => prev.map(s => s.id === shipDocId ? { ...s, shipmentStatus: 'delivered' } : s));
            // Alert.alert("Thành công", "Bạn đã xác nhận nhận hàng.");
        } catch (error) {
            console.error(`Error confirming delivery for ship doc ${shipDocId}:`, error);
            Alert.alert("Lỗi", "Không thể xác nhận.");
        } finally {
            setActionLoadingId(null);
        }
    };

    // --- Component Render Item Card ---
    const ListItemCard = ({ itemData }: { itemData: DisplayItem }) => {
        // Xác định loại item bằng type marker hoặc tab đang active
        const isOrderTab = itemData._type === 'transaction';
        const transaction = isOrderTab ? itemData : null;
        const shipDoc = !isOrderTab ? itemData : null;

        const createdAt = itemData.createdAt || new Date();
        const displayId = itemData.id || 'N/A';
        const totalAmount = itemData.totalAmount ?? 0;

        // Xác định trạng thái hiển thị
        let displayStatusLabel = 'Không rõ';
        let displayStatusStyle = {};
        if (isOrderTab && transaction) {
             switch(transaction.status) {
                case 'pending': displayStatusLabel = 'Đang xử lý'; displayStatusStyle = styles.pendingStatus; break;
                case 'completed': displayStatusLabel = 'Hoàn thành'; displayStatusStyle = styles.completedStatus; break;
                case 'cancelled': displayStatusLabel = 'Đã hủy'; displayStatusStyle = styles.cancelledStatus; break;
             }
        } else if (!isOrderTab && shipDoc) {
            switch(shipDoc.shipmentStatus) {
                case 'shipping': displayStatusLabel = 'Đang giao'; displayStatusStyle = styles.shippingStatus; break;
                case 'arrived': displayStatusLabel = 'Đã đến'; displayStatusStyle = styles.arrivedStatus; break;
                case 'delivered': displayStatusLabel = 'Đã giao'; displayStatusStyle = styles.deliveredStatus; break;
            }
        }

        return (
            <View style={styles.transactionCard}>
                {/* Header */}
                <View style={styles.transactionHeader}>
                    <Text style={styles.orderId}>{isOrderTab ? 'Đơn #' : 'Ship #'}{displayId.slice(0, 8)}</Text>
                    <Text style={[styles.statusText, displayStatusStyle]}>{displayStatusLabel}</Text>
                </View>

                {/* Thông tin theo Tab */}
                {isOrderTab && transaction && (
                    <>
                        <Text style={styles.storeName}>{transaction.storeName}</Text>
                        <Text style={styles.orderDate}>
                            {createdAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} | {createdAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <View style={styles.divider} />
                        <View style={styles.itemsContainer}>
                            {transaction.items.map((txItem, index) => (
                                <View key={`${txItem.productId}-${index}`} style={styles.itemRow}>
                                    <View style={styles.itemInfo}>
                                        <Text style={styles.itemName} numberOfLines={1}>{txItem.productName || 'Sản phẩm'}</Text>
                                        <Text style={styles.itemQuantity}>x {txItem.quantity}</Text>
                                    </View>
                                    <Text style={styles.itemPrice}>{(txItem.price || 0).toLocaleString('vi-VN')}đ</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {!isOrderTab && shipDoc && (
                    <>
                        <Text style={styles.recipientInfo} numberOfLines={1}>Người nhận: {shipDoc.recipientName} - {shipDoc.recipientPhone}</Text>
                        <Text style={styles.addressInfo} numberOfLines={2}>Địa chỉ: {shipDoc.deliveryAddress}</Text>
                        {shipDoc.shipperName && shipDoc.shipmentStatus === 'shipping' && (
                            <View style={styles.shipperInfo}>
                                <Feather name="truck" size={14} color="#3B82F6" />
                                <Text style={styles.shipperText}>Giao bởi: {shipDoc.shipperName}</Text>
                            </View>
                        )}
                         <Text style={styles.orderDate}>
                            Ngày tạo: {createdAt.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                        </Text>
                        <View style={styles.divider} />
                        <View style={styles.itemsContainer}>
                             <Text style={styles.itemsSummaryTitle}>Tóm tắt sản phẩm:</Text>
                            {shipDoc.itemsSummary.map((summaryItem, index) => (
                                <View key={`summary-${index}`} style={styles.summaryItemRow}>
                                    <Text style={styles.summaryItemText} numberOfLines={1}>- {summaryItem.productName || 'Sản phẩm'}</Text>
                                    <Text style={styles.summaryItemQuantity}>SL: {summaryItem.quantity}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                )}

                {/* Divider */}
                <View style={styles.divider} />
                {/* Total */}
                <View style={styles.totalContainer}>
                    <Text style={styles.totalLabel}>Tổng cộng:</Text>
                    <Text style={styles.totalText}>{totalAmount.toLocaleString('vi-VN')}đ</Text>
                </View>

                {/* Conditional Buttons */}
                {isOrderTab && transaction?.status === 'pending' && (
                     <View style={styles.actionButtonSection}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.cancelButton, actionLoadingId === transaction.id && styles.actionButtonDisabled]}
                            onPress={() => Alert.alert(
                                "Xác nhận hủy đơn",
                                "Bạn có chắc muốn hủy đơn hàng này?",
                                [
                                    { text: "Không", style: "cancel" },
                                    { text: "Hủy đơn", style: "destructive", onPress: () => handleCancelOrder(transaction.id) }
                                ]
                            )}
                            disabled={!!actionLoadingId}
                        >
                            {actionLoadingId === transaction.id
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={styles.actionButtonText}>Hủy đơn</Text>}
                        </TouchableOpacity>
                    </View>
                )}

                {!isOrderTab && shipDoc?.shipmentStatus === 'arrived' && (
                    <View style={styles.actionButtonSection}>
                        <TouchableOpacity
                            style={[styles.actionButton, styles.confirmButton, actionLoadingId === shipDoc.id && styles.actionButtonDisabled]}
                            onPress={() => handleConfirmDelivery(shipDoc.id)}
                            disabled={!!actionLoadingId}
                        >
                            {actionLoadingId === shipDoc.id
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <Text style={styles.actionButtonText}>Xác nhận đã nhận</Text>}
                        </TouchableOpacity>
                    </View>
                )}
            </View> // End Card
        );
    };


    // ----- Render Chính -----
    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#3B82F6" />
                <Text style={styles.loadingText}>Đang tải...</Text>
            </View>
        );
    }
    if (!user) {
        return (
            <View style={styles.emptyCartContainer}>
                <Stack.Screen options={{ title: "Quản lý đơn", headerRight: () => null }} />
                <Ionicons name="log-in-outline" size={64} color="#9CA3AF" />
                <Text style={styles.emptyCartText}>Vui lòng đăng nhập</Text>
                <TouchableOpacity style={styles.shopButton} onPress={() => router.push('/login')}>
                    <Text style={styles.shopButtonText}>Đăng nhập</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ title: 'Quản lý đơn hàng' }} />

            {/* Main Tabs */}
            <View style={styles.mainTabContainer}>
                <TouchableOpacity
                    style={[styles.mainTabButton, mainActiveTab === 'orders' && styles.mainTabActiveButtonOrders]}
                    onPress={() => { setMainActiveTab('orders'); setSubActiveTab('all'); }}>
                    <Ionicons name={mainActiveTab === 'orders' ? "receipt" : "receipt-outline"} size={20} color={mainActiveTab === 'orders' ? '#2563EB' : '#6B7280'} />
                    <Text style={[styles.mainTabText, mainActiveTab === 'orders' && styles.mainTabActiveText]}>Đơn hàng</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.mainTabButton, mainActiveTab === 'shipping' && styles.mainTabActiveButtonShipping]}
                    onPress={() => { setMainActiveTab('shipping'); setSubActiveTab('all'); }}>
                    <Ionicons name={mainActiveTab === 'shipping' ? "car-sport" : "car-sport-outline"} size={22} color={mainActiveTab === 'shipping' ? '#16A34A' : '#6B7280'} />
                    <Text style={[styles.mainTabText, mainActiveTab === 'shipping' && styles.mainTabActiveText]}>Vận chuyển</Text>
                </TouchableOpacity>
            </View>

            {/* Sub Tabs */}
            <View style={styles.subTabContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subTabScrollContent}>
                    {currentSubTabs.map(tab => (
                        <TouchableOpacity
                            key={tab.id}
                            onPress={() => setSubActiveTab(tab.id)}
                            style={[styles.subTabButton, subActiveTab === tab.id && styles.subTabActiveButton]}
                        >
                            <Text style={[styles.subTabText, subActiveTab === tab.id && styles.subTabActiveText]}>
                                {tab.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Content List */}
            <FlatList<DisplayItem> // <-- Sử dụng Union Type
                data={displayData}
                renderItem={({ item }) => <ListItemCard itemData={item} />}
                keyExtractor={(item) => item.id}
                style={styles.contentList}
                contentContainerStyle={styles.contentListContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        colors={['#3B82F6']}
                    />
                }
                ListEmptyComponent={
                    <View style={styles.emptyOrderContainer}>
                        <Ionicons name="file-tray-outline" size={50} color="#9CA3AF" />
                        <Text style={styles.emptyText}>
                            {mainActiveTab === 'orders' ? 'Không có đơn hàng nào.' : 'Không có thông tin vận chuyển nào.'}
                        </Text>
                    </View>
                }
                // Thêm một khoảng trống dưới cùng để tránh bị che bởi bottom tab (nếu có)
                ListFooterComponent={<View style={{ height: 20 }} />}
            />
        </View>
    );
}

// ----- StyleSheet -----
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F9FAFB',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F9FAFB',
    },
    loadingText: {
        marginTop: 12,
        fontSize: 16,
        color: '#6B7280',
    },
    emptyCartContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30,
        backgroundColor: '#F9FAFB',
    },
    emptyCartText: {
        fontSize: 18,
        color: '#4B5563',
        marginTop: 20,
        marginBottom: 30,
        textAlign: 'center',
    },
    shopButton: {
        backgroundColor: '#2563EB',
        paddingHorizontal: 30,
        paddingVertical: 14,
        borderRadius: 8,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 5,
    },
    shopButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    mainTabContainer: {
        flexDirection: 'row',
        backgroundColor: 'white',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    mainTabButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderBottomWidth: 3,
        borderBottomColor: 'transparent',
    },
    mainTabActiveButtonOrders: {
        borderBottomColor: '#3B82F6',
    },
    mainTabActiveButtonShipping: {
        borderBottomColor: '#16A34A',
    },
    mainTabText: {
        marginLeft: 8,
        fontSize: 15,
        fontWeight: '500',
        color: '#6B7280',
    },
    mainTabActiveText: {
        color: '#1F2937',
        fontWeight: '600',
    },
    subTabContainer: {
        backgroundColor: 'white',
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    subTabScrollContent: {
        paddingVertical: 8,
        alignItems: 'center',
    },
    subTabButton: {
        marginRight: 10,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#F9FAFB',
    },
    subTabActiveButton: {
        backgroundColor: '#E0F2FE',
        borderColor: '#BAE6FD',
    },
    subTabText: {
        color: '#4B5563',
        fontWeight: '500',
        fontSize: 13,
    },
    subTabActiveText: {
        color: '#0C4A6E',
        fontWeight: '600',
    },
    contentList: {
        flex: 1,
    },
    contentListContainer: {
        paddingVertical: 16,
        paddingHorizontal: 12,
        flexGrow: 1,
    },
    emptyOrderContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        marginTop: 20,
    },
    emptyText: {
        marginTop: 15,
        fontSize: 15,
        color: '#6B7280',
        textAlign: 'center',
    },
    transactionCard: {
        backgroundColor: 'white',
        borderRadius: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    transactionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingTop: 14,
        paddingBottom: 8,
    },
    orderId: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1F2937',
    },
    statusText: {
        fontSize: 12,
        fontWeight: '600',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        overflow: 'hidden',
        textAlign: 'center',
    },
    pendingStatus: {
        backgroundColor: '#FEF3C7',
        color: '#B45309',
    },
    completedStatus: {
        backgroundColor: '#D1FAE5',
        color: '#065F46',
    },
    cancelledStatus: {
        backgroundColor: '#FEE2E2',
        color: '#991B1B',
    },
    shippingStatus: {
        backgroundColor: '#E0F2FE',
        color: '#0C4A6E',
    },
    arrivedStatus: {
        backgroundColor: '#F3E8FF',
        color: '#6B21A8',
    },
    deliveredStatus: {
        backgroundColor: '#DCFCE7',
        color: '#166534',
    },
    storeName: {
        fontSize: 13,
        color: '#4B5563',
        marginBottom: 2,
        paddingHorizontal: 14,
    },
    recipientInfo: {
        fontSize: 13,
        color: '#1F2937',
        fontWeight: '500',
        marginBottom: 2,
        paddingHorizontal: 14,
    },
    addressInfo: {
        fontSize: 13,
        color: '#4B5563',
        paddingHorizontal: 14,
        marginBottom: 5,
    },
    orderDate: {
        fontSize: 12,
        color: '#6B7280',
        paddingHorizontal: 14,
        marginBottom: 10,
    },
    shipperInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        marginBottom: 10,
    },
    shipperText: {
        fontSize: 13,
        color: '#3B82F6',
        marginLeft: 6,
    },
    divider: {
        height: 1,
        backgroundColor: '#F3F4F6',
        marginHorizontal: 14,
    },
    itemsContainer: {
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    itemInfo: {
        flex: 1,
        marginRight: 10,
    },
    itemName: {
        fontSize: 14,
        color: '#1F2937',
    },
    itemQuantity: {
        fontSize: 13,
        color: '#6B7280',
        marginTop: 2,
    },
    itemPrice: {
        fontSize: 14,
        fontWeight: '500',
        color: '#374151',
    },
    itemsSummaryTitle: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 5,
        color: '#374151',
    },
    summaryItemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 3,
    },
    summaryItemText: {
        fontSize: 14,
        color: '#4B5563',
        flex: 1,
        marginRight: 5,
    },
    summaryItemQuantity: {
        fontSize: 14,
        color: '#4B5563',
        fontWeight: '500'
    },
    totalContainer: {
        paddingHorizontal: 14,
        paddingVertical: 14,
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
    },
    totalLabel: {
        fontSize: 14,
        color: '#4B5563',
        marginRight: 8,
    },
    totalText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#DC2626',
    },
    actionButtonSection: {
        padding: 14,
        borderTopWidth: 1,
        borderTopColor: '#F3F4F6',
        backgroundColor: '#F9FAFB'
    },
    actionButton: {
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionButtonDisabled: {
        opacity: 0.6,
    },
    actionButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#FFF',
    },
    cancelButton: {
        backgroundColor: '#EF4444',
    },
    confirmButton: {
        backgroundColor: '#16A34A',
    },
});