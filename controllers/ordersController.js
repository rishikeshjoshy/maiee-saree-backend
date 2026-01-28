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

    // Success
    console.log("Order Success! ID:", order.id);
    res.status(201).json({ success: true, order_id: order.id });

  } catch (error) {
    console.error("Order Failed:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
};