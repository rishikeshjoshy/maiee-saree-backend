const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.local.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.local.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders: [] }, null, 2));
  if (!fs.existsSync(PRODUCTS_FILE)) fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products: [] }, null, 2));
}

function readLocalOrders() {
  ensureDataFiles();
  const raw = fs.readFileSync(ORDERS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.orders) ? parsed.orders : [];
}

function writeLocalOrders(orders) {
  ensureDataFiles();
  fs.writeFileSync(ORDERS_FILE, JSON.stringify({ orders }, null, 2));
}

function readLocalProducts() {
  ensureDataFiles();
  const raw = fs.readFileSync(PRODUCTS_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.products) ? parsed.products : [];
}

function writeLocalProducts(products) {
  ensureDataFiles();
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify({ products }, null, 2));
}

function buildCheckoutPayload(orderId, orderNumber, totalAmount) {
  const now = Date.now();
  return {
    success: true,
    orderId,
    order_id: orderId,
    orderNumber,
    total: totalAmount,
    paymentSession: {
      paymentId: `PAY-${now}`,
      sessionId: `SESS-${now}`,
      expiresAt: new Date(now + 15 * 60 * 1000).toISOString(),
      methods: ['cod', 'upi'],
    },
  };
}

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

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('Order must contain at least one item');
    }

    const hasLocalProduct = items.some((item) => String(item.product_id || '').startsWith('local-'));
    if (hasLocalProduct) {
      throw new Error('LOCAL_ORDER_FALLBACK');
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
    const orderNumber = `ORD-${String(order.id).slice(-6).toUpperCase()}`;
    res.status(201).json(buildCheckoutPayload(order.id, orderNumber, Number(total_amount) || 0));

  } catch (error) {
    console.error("Order Failed:", error.message);

    try {
      const body = req.body || {};
      const customer = body.customer_details || {};
      const orderItems = Array.isArray(body.items) ? body.items : [];
      const totalAmount = Number(body.total_amount) || 0;

      const orderId = `local-order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const orderNumber = `LOCAL-${String(Date.now()).slice(-6)}`;
      const localOrder = {
        id: orderId,
        orderNumber,
        customer_name: String(customer.name || 'Guest'),
        customer_email: String(customer.email || ''),
        customer_phone: String(customer.phone || ''),
        shipping_address: String(body.shipping_address || ''),
        total_amount: totalAmount,
        status: 'Pending',
        payment_status: 'Pending',
        created_at: new Date().toISOString(),
        order_items: orderItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.name,
          color_name: item.color || 'Default',
          quantity: Number(item.quantity) || 1,
          price_at_purchase: Number(item.price) || 0,
        })),
      };

      const localOrders = readLocalOrders();
      localOrders.unshift(localOrder);
      writeLocalOrders(localOrders);

      // Deduct stock for locally stored products when possible
      const localProducts = readLocalProducts();
      let productTouched = false;

      for (const item of orderItems) {
        const idx = localProducts.findIndex((product) => String(product.id) === String(item.product_id));
        if (idx === -1) continue;

        const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
        if (Array.isArray(localProducts[idx].product_variants) && localProducts[idx].product_variants[0]) {
          const currentStock = parseInt(localProducts[idx].product_variants[0].stock_quantity, 10) || 0;
          localProducts[idx].product_variants[0].stock_quantity = Math.max(0, currentStock - quantity);
          localProducts[idx].updated_at = new Date().toISOString();
          productTouched = true;
        }
      }

      if (productTouched) {
        writeLocalProducts(localProducts);
      }

      return res.status(201).json(buildCheckoutPayload(orderId, orderNumber, totalAmount));
    } catch (fallbackError) {
      console.error('Local order fallback failed:', fallbackError.message);
      return res.status(500).json({ success: false, error: fallbackError.message || error.message });
    }
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

      const localOrders = readLocalOrders();
      res.status(200).json({ success : true , count : transformedData.length + localOrders.length , data : [...localOrders, ...transformedData]});

    } catch (error) {
      console.error("getAllOrders fallback:", error.message);
      const localOrders = readLocalOrders();
      res.status(200).json({ success : true , count : localOrders.length , data : localOrders, warning: "Order source unavailable" });
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
        const localOrders = readLocalOrders();
        const merged = [...localOrders, ...data];
        const totalOrders = merged.length;

        // Sum up all the revenue (using reduce function)
        const totalRevenue = merged.reduce(( acc, order) => acc + (parseFloat(order.total_amount) || 0), 0);

        // Count orders by status (Using workflow status like we fixed before)
        const pendingOrders = merged.filter( o => o.status === 'Pending' || o.payment_status === 'Pending').length;
        const shippingOrders = merged.filter(o => o.status === 'Shipping' || o.status === 'Shipped').length;

        // Count completed orders
        const completedOrders = merged.filter(o => o.payment_status === 'Delivered').length;

        const statsPayload = {
          total_orders : totalOrders,
          total_revenue : totalRevenue,
          pending_orders : pendingOrders,
          shipping_orders : shippingOrders,
          completed_orders : completedOrders 
        };

        res.status(200).json({ success : true , data : statsPayload, stats: statsPayload });

    } catch(error) {
      console.error("getOrderStats fallback:", error.message);
      const statsPayload = {
        total_orders : 0,
        total_revenue : 0,
        pending_orders : 0,
        shipping_orders : 0,
        completed_orders : 0
      };

      res.status(200).json({ success : true , data : statsPayload, stats: statsPayload, warning: "Stats source unavailable" });
    }
};