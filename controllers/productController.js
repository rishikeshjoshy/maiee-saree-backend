const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.local.json');
const IMAGE_BUCKET = process.env.SUPABASE_PRODUCT_IMAGES_BUCKET || 'product-images';

function ensureLocalStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: [] }, null, 2));
}

function readLocalProducts() {
  ensureLocalStore();
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.products) ? parsed.products : [];
}

function writeLocalProducts(products) {
  ensureLocalStore();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2));
}

function slugify(input = '') {
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function buildLocalProduct(body, files) {
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const basePrice = Number(body.base_price || 0);
  const category = String(body.category || 'General').trim();
  const stock = Math.max(0, parseInt(body.stock, 10) || 0);
  const colorName = String(body.color_name || 'Standard').trim();
  const colorHex = String(body.color_hex || '#800000').trim();
  const collections = String(body.collections || '').trim();

  const images = [];
  const productId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const slug = slugify(title) || productId;

  return {
    id: productId,
    title,
    name: title,
    slug,
    description,
    base_price: basePrice,
    category,
    collection_slug: collections,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    product_variants: [
      {
        id: `${productId}-variant-1`,
        product_id: productId,
        color_name: colorName,
        color_hex: colorHex,
        color_value: colorHex,
        stock_quantity: stock,
        images,
      },
    ],
  };
}

// @desc    Get All Products with Variants
// @route   GET /api/products
exports.getAllProducts = async (req, res) => {
  try {
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select(`
        *,
        product_variants (
          id,
          product_id,
          color_name,
          color_hex,
          color_value,
          stock_quantity,
          images
        )
      `)
      .order('created_at', { ascending: false });

    if (productsError) throw productsError;

    const normalized = (products || []).map((product) => ({
      ...product,
      product_variants: Array.isArray(product.product_variants) ? product.product_variants : [],
    }));

    res.status(200).json({ success: true, count: normalized.length, data: normalized });
  } catch (error) {
    console.error('getAllProducts fallback:', error.message);
    const localProducts = readLocalProducts();
    res.status(200).json({ success: true, count: localProducts.length, data: localProducts, warning: 'Product source unavailable, serving local data' });
  }
};

// @desc    Create Product with Image
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    const {
      title,
      description,
      base_price,
      category,
      stock,
      color_name,
      color_hex,
    } = req.body;

    const files = req.files;

    if (!title || !base_price || !files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'Missing required fields or images' });
    }

    const imageUrls = [];

    for (const file of files) {
      const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;

      const { error: uploadError } = await supabase
        .storage
        .from(IMAGE_BUCKET)
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Supabase storage upload failed: ${uploadError.message}`);
      }

      const { data: urlData } = supabase
        .storage
        .from(IMAGE_BUCKET)
        .getPublicUrl(fileName);

      imageUrls.push(urlData.publicUrl);
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([
        {
          title,
          description: description || '',
          base_price: parseFloat(base_price),
          category: category || 'General',
        },
      ])
      .select()
      .single();

    if (productError) throw productError;

    const { error: variantError } = await supabase
      .from('product_variants')
      .insert([
        {
          product_id: product.id,
          color_name: color_name || 'Standard',
          color_value: color_hex || '#000000',
          stock_quantity: parseInt(stock, 10) || 0,
          images: imageUrls,
        },
      ]);

    if (variantError) throw variantError;

    res.status(201).json({
      success: true,
      message: 'Product uploaded successfully',
      data: product,
    });
  } catch (error) {
    console.error('createProduct fallback:', error.message);
    res.status(502).json({
      success: false,
      error: `Image upload failed to Supabase bucket '${IMAGE_BUCKET}': ${error.message}`,
      details: error.message,
    });
  }
};

// @desc    Update Product Details & Stock
// @route   PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, base_price, category, stock } = req.body;

    const { error: productError } = await supabase
      .from('products')
      .update({
        title,
        description,
        base_price: parseFloat(base_price),
        category,
      })
      .eq('id', id);

    if (productError) throw productError;

    if (stock !== undefined) {
      const { error: variantError } = await supabase
        .from('product_variants')
        .update({ stock_quantity: parseInt(stock, 10) })
        .eq('product_id', id);

      if (variantError) throw variantError;
    }

    res.status(200).json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('updateProduct fallback:', error.message);
    const localProducts = readLocalProducts();
    const index = localProducts.findIndex((item) => String(item.id) === String(req.params.id));

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    const existing = localProducts[index];
    const next = {
      ...existing,
      title: req.body.title ?? existing.title,
      description: req.body.description ?? existing.description,
      base_price: req.body.base_price !== undefined ? Number(req.body.base_price) : existing.base_price,
      category: req.body.category ?? existing.category,
      updated_at: new Date().toISOString(),
    };

    if (req.body.stock !== undefined && Array.isArray(next.product_variants) && next.product_variants[0]) {
      next.product_variants[0].stock_quantity = Math.max(0, parseInt(req.body.stock, 10) || 0);
    }

    localProducts[index] = next;
    writeLocalProducts(localProducts);
    res.status(200).json({ success: true, message: 'Product updated locally', data: next });
  }
};

// @desc    Update Product Stock Only
// @route   PATCH /api/products/:id/stock
exports.updateProductStock = async (req, res) => {
  try {
    const { id } = req.params;
    const stock = Math.max(0, parseInt(req.body.stock, 10) || 0);

    const { error } = await supabase
      .from('product_variants')
      .update({ stock_quantity: stock })
      .eq('product_id', id);

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Stock updated successfully' });
  } catch (error) {
    console.error('Stock update fallback:', error.message);
    const localProducts = readLocalProducts();
    const index = localProducts.findIndex((item) => String(item.id) === String(req.params.id));

    if (index === -1) {
      return res.status(404).json({ success: false, error: 'Product not found' });
    }

    if (!Array.isArray(localProducts[index].product_variants)) {
      localProducts[index].product_variants = [];
    }

    if (!localProducts[index].product_variants[0]) {
      localProducts[index].product_variants[0] = {
        id: `${localProducts[index].id}-variant-1`,
        product_id: localProducts[index].id,
        color_name: 'Standard',
        color_hex: '#800000',
        color_value: '#800000',
        stock_quantity: 0,
        images: [],
      };
    }

    localProducts[index].product_variants[0].stock_quantity = Math.max(0, parseInt(req.body.stock, 10) || 0);
    localProducts[index].updated_at = new Date().toISOString();

    writeLocalProducts(localProducts);
    res.status(200).json({ success: true, message: 'Stock updated locally' });
  }
};

// @desc    Delete Product
// @route   DELETE /api/products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', id);

    if (error) throw error;

    res.status(200).json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('deleteProduct fallback:', error.message);
    const localProducts = readLocalProducts();
    const next = localProducts.filter((item) => String(item.id) !== String(req.params.id));
    writeLocalProducts(next);
    res.status(200).json({ success: true, message: 'Product deleted locally' });
  }
};
