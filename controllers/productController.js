const supabase = require('../config/supabase');

// @desc    Get All Products with Variants
// @route   GET /api/products
exports.getAllProducts = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_variants (
          color_name,
          color_value,
          stock_quantity,
          images
        )
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.status(200).json({ success: true, count: data.length, data: data });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create Product with Image
// @route   POST /api/products
// @desc    Create a new Product with 1 Variant (Color + Images)
// @route   POST /api/products
exports.createProduct = async (req, res) => {
  try {
    console.log("--- STARTED PRODUCT UPLOAD ---");
    
    // 1. EXTRACT DATA (safely parse numbers)
    const { 
      title, 
      description, 
      base_price, 
      category, 
      stock, 
      color_name, 
      color_hex 
    } = req.body;

    const files = req.files; // Multer gives us this

    console.log(`Title: ${title}, Price: ${base_price}, Images: ${files?.length}`);

    // 2. VALIDATION
    if (!title || !base_price || !files || files.length === 0) {
      return res.status(400).json({ success: false, error: "Missing required fields or images" });
    }

    // 3. UPLOAD IMAGES TO SUPABASE STORAGE
    const imageUrls = [];
    
    for (const file of files) {
      // Create a unique filename: timestamp-originalname
      const fileName = `${Date.now()}-${file.originalname.replace(/\s/g, '_')}`;
      
      const { data: uploadData, error: uploadError } = await supabase
        .storage
        .from('product-images') // <--- MAKE SURE THIS BUCKET EXISTS IN SUPABASE
        .upload(fileName, file.buffer, {
          contentType: file.mimetype
        });

      if (uploadError) {
        console.error("Storage Upload Error:", uploadError);
        throw uploadError;
      }

      // Get Public URL
      const { data: urlData } = supabase
        .storage
        .from('product-images')
        .getPublicUrl(fileName);
        
      imageUrls.push(urlData.publicUrl);
    }

    console.log("Images Uploaded:", imageUrls);

    // 4. INSERT PRODUCT (Header)
    const { data: product, error: productError } = await supabase
      .from('products')
      .insert([{
        title: title,
        description: description || '',
        base_price: parseFloat(base_price), // Ensure Number
        category: category || 'General'
      }])
      .select()
      .single();

    if (productError) throw productError;

    // 5. INSERT VARIANT (The detailed stock/images)
    const { error: variantError } = await supabase
      .from('product_variants')
      .insert([{
        product_id: product.id,
        color_name: color_name || 'Standard',
        color_value: color_hex || '#000000',
        stock_quantity: parseInt(stock) || 0, // Ensure Number
        images: imageUrls // Save array of URLs
      }]);

    if (variantError) throw variantError;

    console.log("Product Created Successfully ID:", product.id);

    res.status(201).json({ 
      success: true, 
      message: "Product uploaded successfully",
      data: product 
    });

  } catch (error) {
    console.error("Create Product Crash:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update Product Details & Stock
// @route   PUT /api/products/:id
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, base_price, category, stock } = req.body;

    // 1. Update Main Product Table
    const { error: productError } = await supabase
      .from('products')
      .update({
        title: title,
        description: description,
        base_price: parseFloat(base_price),
        category: category
      })
      .eq('id', id);

    if (productError) throw productError;

    // 2. Update Stock in Variants Table
    if (stock !== undefined) {
      const { error: variantError } = await supabase
        .from('product_variants')
        .update({ stock_quantity: parseInt(stock) })
        .eq('product_id', id);

      if (variantError) throw variantError;
    }

    res.status(200).json({ success: true, message: "Product updated successfully" });

  } catch (error) {
    console.error("Update Error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};