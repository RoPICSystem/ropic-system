'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'
import sharp from 'sharp'

export async function updateCompany(formData: FormData):
  Promise<{ error?: string, success?: boolean }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Extract basic company data
  const name = formData.get('name') as string;
  const description = formData.get('description') as string;
  const logoImage = formData.get('logoImage') as File;
  
  // Parse company layout from form data
  let companyLayout;
  try {
    const layoutString = formData.get('company_layout') as string;
    companyLayout = JSON.parse(layoutString);
    
    // Validate the layout (must be a 3D array)
    if (!Array.isArray(companyLayout)) {
      return { error: 'Invalid layout format: must be an array' };
    }
    
    for (const floor of companyLayout) {
      if (typeof floor !== 'object' || !floor || !Array.isArray(floor.matrix)) {
        return { error: 'Invalid layout format: each floor must be an array' };
      }

      if (typeof floor.height !== 'number' || floor.height <= 0) {
        return { error: 'Invalid layout format: each floor must have a positive height' };
      }
      
      for (const row of floor.matrix) {
        if (!Array.isArray(row)) {
          return { error: 'Invalid layout format: each row must be an array' };
        }
        
        for (const cell of row) {
          if (typeof cell !== 'number' || cell < 0 || cell > 100) {
            return { error: 'Invalid layout format: each cell must be a number between 0 and 100' };
          }
        }
      }
    }
  } catch (error) {
    console.error('Error parsing layout:', error);
    companyLayout = []; // Default to empty layout if parsing fails
  }

  // Extract address data
  const address = {
    country: {
      code: formData.get('address.country.code') as string,
      desc: formData.get('address.country.desc') as string
    },
    region: {
      code: formData.get('address.region.code') as string,
      desc: formData.get('address.region.desc') as string
    },
    province: {
      code: formData.get('address.province.code') as string,
      desc: formData.get('address.province.desc') as string
    },
    municipality: {
      code: formData.get('address.municipality.code') as string,
      desc: formData.get('address.municipality.desc') as string
    },
    barangay: {
      code: formData.get('address.barangay.code') as string,
      desc: formData.get('address.barangay.desc') as string
    },
    streetAddress: formData.get('address.streetAddress') as string,
    postalCode: formData.get('address.postalCode') as string,
    fullAddress: formData.get('address.fullAddress') as string
  };

  try {
    // Get company UUID for the current user
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('company_uuid')
      .eq('uuid', user.id)
      .single();

    if (userError || !userData?.company_uuid) {
      return { error: 'Could not find company information for this user' }
    }

    const companyUuid = userData.company_uuid;

    // Process logo image if uploaded
    if (logoImage && logoImage.size > 0) {
      try {
        const fileBuffer = Buffer.from(await logoImage.arrayBuffer());
        
        // Optimize image
        const optimizedImageBuffer = await sharp(fileBuffer)
          .resize({
            width: 512,
            height: 512,
            fit: 'inside',
            withoutEnlargement: true
          })
          .webp({ quality: 80 })
          .toBuffer();

        // Upload logo to storage
        const { error: uploadError } = await supabase
          .storage
          .from('company-images')
          .upload(`logo/${companyUuid}/logo.webp`, optimizedImageBuffer, {
            contentType: 'image/webp',
            upsert: true
          });

        if (uploadError) {
          console.error('Logo upload error:', uploadError);
          return { error: 'Failed to upload company logo' };
        }
      } catch (error) {
        console.error('Image processing error:', error);
        return { error: 'Failed to process logo image' };
      }
    }

    // Update company data
    const updateData = {
      name,
      description,
      address,
      logo_image: `logo/${companyUuid}/logo.webp`,
      updated_at: new Date().toISOString(),
      company_layout: companyLayout // Add the layout data
    };

    const { error: updateError } = await supabase
      .from('companies')
      .update(updateData)
      .eq('uuid', companyUuid);

    if (updateError) {
      return { error: updateError.message };
    }

    // Revalidate paths
    revalidatePath('/home/company');
    revalidatePath('/home/company/edit');
    revalidatePath('/home/inventory');
    
    return { success: true };
  } catch (error: any) {
    console.error('Error updating company:', error);
    return { error: error.message || 'An unexpected error occurred' };
  }
}