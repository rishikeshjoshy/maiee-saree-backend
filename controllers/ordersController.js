const supabase = require('../config/supabase');

exports.placeOrder = async (req, res) => {
  try {
    const { customer_details, shipping_address, items, total_amount } = req.body;

    // --- DEBUGGING BLOCK (The "Sanity Check") ---
    // We explicitly pull the variables out here to see if they exist
    const cName = customer_details?.name;
    const cEmail = customer_details?.email;
    const cPhone = customer_details?.phone; // This is the trouble maker

    console.log("--------------------------------");
    console.log("Preparing to Insert:");
    console.log("Name:", cName);
    console.log("Email:", cEmail);
    console.log("Phone:", cPhone); // If this says 'undefined', your JSON key is wrong
    console.log("--------------------------------");

    if (!cPhone) {
        throw new Error("Phone number is missing from customer_details");
    }

    // 1. Create Order Header
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        customer_name: cName,
        customer_email: cEmail,
        customer_phone: cPhone, // Using the extracted variable
        shipping_address: shipping_address,
        total_amount: total_amount,
        status: 'Pending', // Ensuring workflow status is here
        payment_status: 'Pending',
        payment_method: 'COD' 
      }])
      .select().single();

    if (orderError) throw orderError;

    // 2. Prepare Items
    const orderItems = items.map(item => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.name,
      color_name: item.color,
      quantity: item.quantity,
      price_at_purchase: item.price
    }));

    // 3. Save Items
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) throw itemsError;

    // ---------------------------------------------------------
    // 4. DEDUCT STOCK FROM INVENTORY (THE NEW SYNC LOGIC)
    // ---------------------------------------------------------
    console.log("Order saved. Deducting stock...");
    
    for (const item of items) {
      // Step A: Fetch current stock for this specific product
      const { data: variant, error: fetchError } = await supabase
        .from('product_variants')
        .select('stock_quantity')
        .eq('product_id', item.product_id)
        .single();

      if (!fetchError && variant) {
        // Step B: Calculate new stock (prevent it from going below 0)
        const newStock = Math.max(0, variant.stock_quantity - item.quantity);
        
        // Step C: Update the database
        await supabase
          .from('product_variants')
          .update({ stock_quantity: newStock })
          .eq('product_id', item.product_id);
          
        console.log(`Product ${item.product_id} stock successfully reduced to ${newStock}`);
      } else {
        console.error(`Failed to fetch stock for Product ${item.product_id}:`, fetchError);
      }
    }
    // ---------------------------------------------------------

    // Success
    console.log("Order Success! ID:", order.id);
    res.status(201).json({ success: true, order_id: order.id });

  } catch (error) {
    console.error("Order Failed:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    GET ALL orders (Admin only)
// @route   GET /api/orders/admin
exports.getAllOrders = async (req , res) => {
    try{
        const { data , error } = await supabase
        .from('orders')
        .select(`
        *,
        order_items (
          product_name,
          color_name,
          quantity,
          price_at_purchase
        )
      `)
      .order('created_at', { ascending: false });

      if(error) throw error;

      // Transform data to match frontend 
      const transformedData = data.map(order => ({
        ...order,
        customer_details: {
          name: order.customer_name,
          email: order.customer_email,
          phone: order.customer_phone
        },
        status: order.payment_status?.toLowerCase() || 'pending',
        items: order.order_items?.map(item => ({
          product_id: item.product_id,
          name: item.product_name,
          color: item.color_name,
          quantity: item.quantity,
          price: item.price_at_purchase
        })) || []
      }));

      res.status(200).json({ success : true , count : transformedData.length , data : transformedData});

    } catch (error) {
        res.status(500).json({ success : false , error : error.message });
    }
};

// @desc Update Order Status
// @route PUT /api/orders/:id/status
exports.updateOrderStatus = async ( req , res ) => {
    const { id } = req.params;
    const { status } = req.body;

    console.log(`---- DEBUG STATUS UPDATE ----`);
    console.log(`Target Order ID: ${id}`);
    console.log(`New Status : ${status}`);
    console.log(`-----------------------------`)

    try{
        // Validation 
        if(!status){
            throw new Error("Missing 'status' in Request Body");
        }

        // Perform Update
        const{ data , error } = await supabase
        .from('orders')
        .update({ status : status }) // Keeping this mapped to 'status' as we fixed earlier
        .eq('id', id )
        .select()
        .single();

        if(error) {
            console.error("Supabase Error: ", error);
            throw error;
        }

        console.log('Update Success: ', data);

        res.status(200).json({ 
          success : true , 
          message : `Order updated as ${status}`, 
          data : data });
        
    } catch (error) {
        console.error("Server Crash ", error.message);
        
        // Handle specific "NOT FOUND" error
        if(error.code == 'PGRST116'){
            return res.status(404).json({success : false , error : "Order ID not Found"});
        }

        res.status(500).json({ success : false , error : error.message });
    }
};

// @desc    Get Dashboard Stats (Revenue , Counts)
// @route   GET /api/orders/admin/stats
exports.getOrderStats = async ( req , res ) => {
    try{
        // Fetching only the columns as we need to calculate stats
        const { data , error } = await supabase
        .from('orders')
        .select('total_amount , payment_status, status'); // Added status here to ensure accurate counting

        if(error) throw error;

        // Calculate in JS
        const totalOrders = data.length;

        // Sum up all the revenue (using reduce function)
        const totalRevenue = data.reduce(( acc, order) => acc + (parseFloat(order.total_amount) || 0), 0);

        // Count orders by status (Using workflow status like we fixed before)
        const pendingOrders = data.filter( o => o.status === 'Pending' || o.payment_status === 'Pending').length;
        const shippingOrders = data.filter(o => o.status === 'Shipping' || o.status === 'Shipped').length;

        // Count completed orders
        const completedOrders = data.filter(o => o.payment_status === 'Delivered').length;

        res.status(200).json({ success : true , data : {
            total_orders : totalOrders,
            total_revenue : totalRevenue,
            pending_orders : pendingOrders,
            shipping_orders : shippingOrders,
            completed_orders : completedOrders 
        }
    });

    } catch(error) {
        res.status(500).json({ success : false , error : error.message });
    }
};