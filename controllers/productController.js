const supabase = require('../config/supabase');

// @desc      Get all products with their product variants
// @route     GET/api/products
// @access    Public

exports.getAllProducts = async (req , res) => {
    try {
        console.log("Fetching Products..");  // Debug Log in Terminal

        // We * products and join with product_variants table
        const { data, error } = await supabase
      .from('products')
      .select(`
        *,
        product_variants (
          id,
          color_name,
          color_hex,
          stock_quantity,
          images
        )
      `);

      if(error){
        throw error;
      }

      //  Send successful response
      res.status(200).json({
        success : true,
        count : data.length,
        data : data
      });
    
    } catch (error) {
        console.error("Error fetching products:", error.message);
        res.status(500).json({
            success : false,
            message : "Server Error",
            error : error.message
        });
    }
};