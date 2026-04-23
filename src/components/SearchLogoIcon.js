import React from 'react'
import Svg, { Path } from 'react-native-svg'

/** Heroicons solid magnifying glass — Explore tab */
const SearchLogoIcon = ({ size = 26, color, ...rest }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
    <Path
      fill={color}
      fillRule="evenodd"
      clipRule="evenodd"
      d="M10.5 3.75a6.75 6.75 0 1 0 0 13.5 6.75 6.75 0 0 0 0-13.5ZM2.25 10.5a8.25 8.25 0 1 1 14.59 5.28l4.69 4.69a.75.75 0 1 1-1.06 1.06l-4.69-4.69A8.25 8.25 0 0 1 2.25 10.5Z"
    />
  </Svg>
)

export default SearchLogoIcon
