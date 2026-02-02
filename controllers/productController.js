const supabase = require('../config/supabase');

// @desc    Get All Products (With Variants if available)
// @route   GET /api/products
exports.getAllProducts = async (req, res) => {
  try {
    // Fetch products first
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*');

    if (productsError) throw productsError;

    // Try to fetch variants (table may not exist)
    let variants = [];
    const { data: variantsData, error: variantsError } = await supabase
      .from('product_variants')
      .select('id, product_id, color_name, color_hex, stock_quantity, images');
    
    if (!variantsError && variantsData) {
      variants = variantsData;
    } else {
      console.log('product_variants table not found or empty, continuing without variants');
    }

    // Manually join products with their variants (or empty array if no variants)
    const productsWithVariants = products.map(product => ({
      ...product,
      product_variants: variants.filter(v => v.product_id === product.id)
    }));

    res.status(200).json({ success: true, count: productsWithVariants.length, data: productsWithVariants });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};


// @desc    Create Product with Image
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    // 1. Log Everything
    console.log("---------------------------------");
    console.log("PROCESSING NEW PRODUCT...");
    console.log("Text Data:", req.body);
    console.log("File Data:", req.file ? "File Attached (Size: " + req.file.size + ")" : "NO FILE DETECTED");

    // 2. Extract Variables
    const { title, description, base_price, category, color_name, color_hex, stock } = req.body;
    const imageFile = req.file;

    // 3. Strict Validation
    if (!imageFile) {
        return res.status(400).json({ success: false, message: "No image file received by Controller" });
    }
    if (!title) {
        return res.status(400).json({ success: false, message: "Missing product title" });
    }

    // 4. Upload to Supabase Storage
    const fileName = `${Date.now()}-${imageFile.originalname.replace(/\s/g, '_')}`;

    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('product-images')
      .upload(fileName, imageFile.buffer, {
        contentType: imageFile.mimetype,
        upsert: false
      });

    if (uploadError) {
        console.error("Supabase Upload Error:", uploadError);
        throw uploadError;
    }

    // 5. Get Public URL
    const { data: urlData } = supabase
      .storage
      .from('product-images')
      .getPublicUrl(fileName);

    const publicImageUrl = urlData.publicUrl;

    // 6. Database Insert (Product)
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([{
        title,
        description,
        base_price,
        category
      }])
      .select()
      .single();

    if (productError) throw productError;

    // 7. Database Insert (Variant)
    const { error: variantError } = await supabase
      .from('product_variants')
      .insert([{
        product_id: product.id,
        color_name: color_name,
        color_hex: color_hex,
        stock_quantity: stock,
        images: [publicImageUrl]
      }]);

    if (variantError) throw variantError;

    // Success
    res.status(201).json({
      success: true,
      message: "Product Created Successfully",
      product_id: product.id,
      image_url: publicImageUrl
    });

  } catch (error) {
    console.error("CRITICAL ERROR:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};