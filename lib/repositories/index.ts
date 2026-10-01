/**
 * Çiftçi Ece — Repository Barrel Export
 */

export {
  getAllProducts,
  getProductBySlug,
  getFeaturedProducts,
  getProductsForAdmin,
  getProductByIdForAdmin,
} from "./product.repository";

export {
  getAllCategories,
  getCategoryBySlug,
  getCategoriesForAdmin,
  getPublishedProductCounts,
} from "./category.repository";

export {
  getVariantById,
  type VariantLookupResult,
} from "./variant.repository";

export { searchProducts } from "./search.repository";

export {
  createOrder,
  getOrderByReference,
  getOrdersForAdmin,
  updateOrderStatus,
  releaseExpiredOrders,
} from "./order.repository";

export {
  getPublishedReviews,
  getAllReviews,
  type ReviewData,
} from "./review.repository";
